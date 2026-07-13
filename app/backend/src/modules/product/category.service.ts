// Category business logic — tree-aware CRUD

import { TenantPrismaClient } from "../../config/database";
import { NotFoundError } from "../../shared/errors/NotFoundError";
import { ConflictError } from "../../shared/errors/ConflictError";
import { ValidationError } from "../../shared/errors/ValidationError";
import { logger } from "../../shared/utils/logger";
import { ciEquals } from "../../shared/utils/ci-match";
import type { CreateCategoryInput, UpdateCategoryInput } from "./product.validation";

// ── Helpers ─────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 240);
}

// ── List categories (tree structure) ────────────────────────────────────────

export async function listCategories(
  db: TenantPrismaClient,
  filters: { isActive?: boolean; flat?: boolean },
) {
  const where: Record<string, unknown> = {};
  if (filters.isActive !== undefined) where.isActive = filters.isActive;

  // Flat mode: return all categories sorted
  if (filters.flat) {
    return db.category.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { products: true } } },
    });
  }

  // Tree mode: fetch top-level categories with children
  return db.category.findMany({
    where: { ...where, parentId: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { products: true } },
      children: {
        where: filters.isActive !== undefined ? { isActive: filters.isActive } : {},
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: {
          _count: { select: { products: true } },
          children: {
            where: filters.isActive !== undefined ? { isActive: filters.isActive } : {},
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            include: { _count: { select: { products: true } } },
          },
        },
      },
    },
  });
}

// ── Get category by ID ──────────────────────────────────────────────────────

export async function getCategoryById(db: TenantPrismaClient, categoryId: string) {
  const category = await db.category.findUnique({
    where: { id: categoryId },
    include: {
      parent: { select: { id: true, name: true, slug: true } },
      children: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, slug: true, isActive: true, sortOrder: true },
      },
      _count: { select: { products: true } },
    },
  });

  if (!category) throw new NotFoundError("Category", categoryId);
  return category;
}

// ── Create category ─────────────────────────────────────────────────────────

export async function createCategory(
  db: TenantPrismaClient,
  tenantId: string,
  input: CreateCategoryInput,
) {
  // Validate parent exists
  if (input.parentId) {
    const parent = await db.category.findUnique({ where: { id: input.parentId } });
    if (!parent) throw new NotFoundError("Parent category", input.parentId);
  }

  // Generate unique slug
  let slug = slugify(input.name);
  const existing = await db.category.findFirst({ where: { slug } });
  if (existing) {
    slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  }

  // Check name uniqueness within same parent level
  const duplicate = await db.category.findFirst({
    where: {
      name: ciEquals(input.name),
      parentId: input.parentId ?? null,
    },
  });
  if (duplicate) {
    throw new ConflictError(`A category named "${input.name}" already exists at this level`);
  }

  const category = await db.category.create({
    data: {
      tenantId,
      name: input.name,
      slug,
      parentId: input.parentId ?? null,
      sortOrder: input.sortOrder ?? 0,
    },
  });

  logger.info({ tenantId, categoryId: category.id }, "Category created");
  return category;
}

// ── Update category ─────────────────────────────────────────────────────────

export async function updateCategory(
  db: TenantPrismaClient,
  categoryId: string,
  input: UpdateCategoryInput,
) {
  const category = await db.category.findUnique({ where: { id: categoryId } });
  if (!category) throw new NotFoundError("Category", categoryId);

  // Prevent circular parent reference
  if (input.parentId) {
    if (input.parentId === categoryId) {
      throw new ValidationError("A category cannot be its own parent");
    }
    const parent = await db.category.findUnique({ where: { id: input.parentId } });
    if (!parent) throw new NotFoundError("Parent category", input.parentId);
    // Check grandparent isn't this category (prevents 2-level cycle)
    if (parent.parentId === categoryId) {
      throw new ValidationError("Circular parent reference detected");
    }
  }

  // Regenerate slug if name changes
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) {
    data.name = input.name;
    let slug = slugify(input.name);
    const existing = await db.category.findFirst({
      where: { slug, id: { not: categoryId } },
    });
    if (existing) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    data.slug = slug;
  }
  if (input.parentId !== undefined) data.parentId = input.parentId;
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
  if (input.isActive !== undefined) data.isActive = input.isActive;

  const updated = await db.category.update({
    where: { id: categoryId },
    data,
  });

  logger.info({ categoryId }, "Category updated");
  return updated;
}

// ── Delete category (soft) ──────────────────────────────────────────────────

export async function deleteCategory(db: TenantPrismaClient, categoryId: string) {
  const category = await db.category.findUnique({
    where: { id: categoryId },
    include: {
      _count: { select: { products: true, children: true } },
    },
  });

  if (!category) throw new NotFoundError("Category", categoryId);

  if (category._count.products > 0) {
    throw new ConflictError(
      `Cannot delete category — ${category._count.products} product(s) assigned. Reassign them first.`,
    );
  }

  if (category._count.children > 0) {
    throw new ConflictError(
      `Cannot delete category — ${category._count.children} sub-category(ies) exist. Delete or move them first.`,
    );
  }

  const updated = await db.category.update({
    where: { id: categoryId },
    data: { isActive: false },
  });

  logger.info({ categoryId }, "Category deactivated");
  return updated;
}
