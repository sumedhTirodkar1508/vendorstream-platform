import bcrypt from "bcryptjs";
import prisma from "../src/index.js";

async function main() {
  const adminPasswordHash = await bcrypt.hash("pass", 10);
  const lpPasswordHash = await bcrypt.hash("pass", 10);
  const storePasswordHash = await bcrypt.hash("pass", 10);

  // Users
  const adminUser = await prisma.user.upsert({
    where: { email: "admin@gmail.com" },
    update: {},
    create: {
      name: "VendorStream Admin",
      email: "admin@gmail.com",
      emailVerified: new Date(),
      passwordHash: adminPasswordHash,
      systemRole: "ADMIN",
      status: "ACTIVE",
    },
  });

  const lpUser = await prisma.user.upsert({
    where: { email: "lpadmin@gmail.com" },
    update: {},
    create: {
      name: "NorthLeaf LP Admin",
      email: "lpadmin@gmail.com",
      emailVerified: new Date(),
      passwordHash: lpPasswordHash,
      systemRole: "USER",
      status: "ACTIVE",
    },
  });

  const storeUser = await prisma.user.upsert({
    where: { email: "storeadmin@gmail.com" },
    update: {},
    create: {
      name: "Maple Retail Store Admin",
      email: "storeadmin@gmail.com",
      emailVerified: new Date(),
      passwordHash: storePasswordHash,
      systemRole: "USER",
      status: "ACTIVE",
    },
  });

  // LP
  const lp = await prisma.lP.upsert({
    where: { code: "NORTHLEAF" },
    update: {},
    create: {
      code: "NORTHLEAF",
      name: "NorthLeaf",
      legalName: "NorthLeaf Licensed Producer Inc.",
      isActive: true,
    },
  });

  // Store Organization
  const storeOrg = await prisma.storeOrganization.upsert({
    where: { code: "MAPLE-RETAIL" },
    update: {},
    create: {
      code: "MAPLE-RETAIL",
      name: "Maple Retail Group",
      legalName: "Maple Retail Group Ltd.",
      isActive: true,
    },
  });

  // Store Location
  const storeLocation = await prisma.storeLocation.upsert({
    where: {
      storeOrganizationId_code: {
        storeOrganizationId: storeOrg.id,
        code: "TOR-001",
      },
    },
    update: {},
    create: {
      storeOrganizationId: storeOrg.id,
      code: "TOR-001",
      name: "Toronto Downtown Store",
      addressLine1: "100 King St W",
      city: "Toronto",
      province: "ON",
      postalCode: "M5X1A9",
      country: "CA",
      isActive: true,
    },
  });

  // Memberships
  await prisma.lpMembership.upsert({
    where: {
      userId_lpId: {
        userId: lpUser.id,
        lpId: lp.id,
      },
    },
    update: {},
    create: {
      userId: lpUser.id,
      lpId: lp.id,
      role: "LP_ADMIN",
    },
  });

  await prisma.storeOrgMembership.upsert({
    where: {
      userId_storeOrganizationId: {
        userId: storeUser.id,
        storeOrganizationId: storeOrg.id,
      },
    },
    update: {},
    create: {
      userId: storeUser.id,
      storeOrganizationId: storeOrg.id,
      role: "STORE_ORG_ADMIN",
    },
  });

  // LP <-> Store Location assignment
  await prisma.storeLocationLpAssignment.upsert({
    where: {
      storeLocationId_lpId: {
        storeLocationId: storeLocation.id,
        lpId: lp.id,
      },
    },
    update: {},
    create: {
      storeLocationId: storeLocation.id,
      lpId: lp.id,
      isActive: true,
    },
  });

  // Rules
  const categoryRule = await prisma.categoryRule.create({
    data: {
      lpId: lp.id,
      categoryKey: "FLOWER",
      displayName: "Flower",
      maxScale: "10.0000",
      maxCommissionPercent: "5.0000",
      isActive: true,
    },
  });

  await prisma.productScaleRule.create({
    data: {
      lpId: lp.id,
      categoryRuleId: categoryRule.id,
      barcode: "123456789012",
      productNameSnapshot: "NorthLeaf Flower 3.5g",
      productScale: "5.0000",
      isActive: true,
    },
  });

  // Reconciliation cycle for current month
  const periodMonth = new Date();
  periodMonth.setUTCDate(1);
  periodMonth.setUTCHours(0, 0, 0, 0);

  const cycle = await prisma.reconciliationCycle.upsert({
    where: {
      lpId_storeLocationId_periodMonth: {
        lpId: lp.id,
        storeLocationId: storeLocation.id,
        periodMonth,
      },
    },
    update: {},
    create: {
      lpId: lp.id,
      storeLocationId: storeLocation.id,
      periodMonth,
      status: "AWAITING_UPLOADS",
    },
  });

  // Dummy uploaded files
  const lpFile = await prisma.uploadedFile.create({
    data: {
      fileKind: "LP_UPLOAD",
      bucket: "raw-imports",
      storagePath: `dev/lp/${cycle.id}/northleaf-lp-upload.xlsx`,
      originalFilename: "northleaf-lp-upload.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sizeBytes: BigInt(20480),
      uploadedByUserId: lpUser.id,
    },
  });

  const storeFile = await prisma.uploadedFile.create({
    data: {
      fileKind: "STORE_UPLOAD",
      bucket: "raw-imports",
      storagePath: `dev/store/${cycle.id}/maple-store-upload.xlsx`,
      originalFilename: "maple-store-upload.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sizeBytes: BigInt(19456),
      uploadedByUserId: storeUser.id,
    },
  });

  // Import batches
  await prisma.importBatch.create({
    data: {
      cycleId: cycle.id,
      uploadedFileId: lpFile.id,
      sourceType: "LP",
      status: "RECEIVED",
      isCurrent: true,
      uploadedByUserId: lpUser.id,
      totalRowCount: 12,
      validRowCount: 12,
      invalidRowCount: 0,
    },
  });

  await prisma.importBatch.create({
    data: {
      cycleId: cycle.id,
      uploadedFileId: storeFile.id,
      sourceType: "STORE",
      status: "RECEIVED",
      isCurrent: true,
      uploadedByUserId: storeUser.id,
      totalRowCount: 12,
      validRowCount: 12,
      invalidRowCount: 0,
    },
  });

  // Statement task placeholder
  await prisma.statementTask.create({
    data: {
      cycleId: cycle.id,
      status: "PENDING",
      requestedByUserId: adminUser.id,
    },
  });

  console.log("Seed complete.");
  console.log("Login accounts:");
  console.log("Admin: admin@gmail.com / pass");
  console.log("LP Admin: lpadmin@gmail.com / pass");
  console.log("Store Admin: storeadmin@gmail.com / pass");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
