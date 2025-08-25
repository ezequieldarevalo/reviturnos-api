-- CreateEnum
CREATE TYPE "public"."AppointmentState" AS ENUM ('EMAIL_PENDING', 'PENDING_PAYMENT', 'AWAITING_CASH', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'ORPHANED');

-- CreateEnum
CREATE TYPE "public"."FuelType" AS ENUM ('NAFTA', 'DIESEL', 'GNC', 'HIBRIDO', 'ELECTRICO', 'OTRO');

-- CreateEnum
CREATE TYPE "public"."Result" AS ENUM ('APROBADO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "public"."PlantRole" AS ENUM ('ADMIN', 'OPERATOR');

-- CreateEnum
CREATE TYPE "public"."RoleGlobal" AS ENUM ('SUPERADMIN');

-- CreateEnum
CREATE TYPE "public"."SlotStatus" AS ENUM ('FREE', 'BOOKED', 'LOCKED');

-- CreateTable
CREATE TABLE "public"."Plant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "province" TEXT,
    "zip" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "logoUrl" TEXT,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "daysAhead" INTEGER NOT NULL DEFAULT 30,
    "lockMinutes" INTEGER NOT NULL DEFAULT 30,
    "cashWindowMinutes" INTEGER NOT NULL DEFAULT 4320,
    "cancelReprogLimitHours" INTEGER NOT NULL DEFAULT 24,
    "reschedulesLimit" INTEGER NOT NULL DEFAULT 2,
    "minYearAllowed" INTEGER NOT NULL DEFAULT 1970,
    "enableNoPay" BOOLEAN NOT NULL DEFAULT true,
    "enableMercadoPago" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VehicleType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PlantVehicleType" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "vehicleTypeId" TEXT NOT NULL,

    CONSTRAINT "PlantVehicleType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PriceRule" (
    "id" TEXT NOT NULL,
    "plantVehicleTypeId" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ARS',

    CONSTRAINT "PriceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Line" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LineConfig" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "maxShiftMinutes" INTEGER NOT NULL DEFAULT 10,

    CONSTRAINT "LineConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WeeklySchedule" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "start" TEXT NOT NULL,
    "end" TEXT NOT NULL,

    CONSTRAINT "WeeklySchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ScheduleException" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "start" TEXT NOT NULL,
    "end" TEXT NOT NULL,
    "reason" TEXT,

    CONSTRAINT "ScheduleException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Slot" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "lineId" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "public"."SlotStatus" NOT NULL DEFAULT 'FREE',
    "generated" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Slot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Vehicle" (
    "id" TEXT NOT NULL,
    "dominio" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Appointment" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "lineId" TEXT,
    "vehicleId" TEXT NOT NULL,
    "vehicleTypeId" TEXT NOT NULL,
    "slotId" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "state" "public"."AppointmentState" NOT NULL,
    "result" "public"."Result",
    "resultDescription" TEXT,
    "resultAt" TIMESTAMP(3),
    "inspectorUserId" TEXT,
    "unitPriceCents" INTEGER,
    "currency" TEXT DEFAULT 'ARS',
    "priceRuleId" TEXT,
    "capturedAt" TIMESTAMP(3),
    "paymentMode" TEXT,
    "paymentExternalId" TEXT,
    "rescheduleCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AppointmentData" (
    "appointmentId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefono" TEXT,
    "dominio" TEXT NOT NULL,
    "marca" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "combustible" "public"."FuelType" NOT NULL,

    CONSTRAINT "AppointmentData_pkey" PRIMARY KEY ("appointmentId")
);

-- CreateTable
CREATE TABLE "public"."PaymentEvent" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExpirationLog" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpirationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditLog" (
    "id" TEXT NOT NULL,
    "plantId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "from" JSONB,
    "to" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "roleGlobal" "public"."RoleGlobal",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "role" "public"."PlantRole" NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plant_slug_key" ON "public"."Plant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleType_name_key" ON "public"."VehicleType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PlantVehicleType_plantId_vehicleTypeId_key" ON "public"."PlantVehicleType"("plantId", "vehicleTypeId");

-- CreateIndex
CREATE INDEX "PriceRule_validFrom_validTo_idx" ON "public"."PriceRule"("validFrom", "validTo");

-- CreateIndex
CREATE INDEX "Line_plantId_isActive_idx" ON "public"."Line"("plantId", "isActive");

-- CreateIndex
CREATE INDEX "LineConfig_lineId_effectiveFrom_idx" ON "public"."LineConfig"("lineId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "WeeklySchedule_plantId_dayOfWeek_idx" ON "public"."WeeklySchedule"("plantId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "ScheduleException_plantId_date_idx" ON "public"."ScheduleException"("plantId", "date");

-- CreateIndex
CREATE INDEX "Slot_plantId_startAt_status_idx" ON "public"."Slot"("plantId", "startAt", "status");

-- CreateIndex
CREATE INDEX "Slot_plantId_startAt_idx" ON "public"."Slot"("plantId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "Slot_lineId_startAt_key" ON "public"."Slot"("lineId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_dominio_key" ON "public"."Vehicle"("dominio");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_slotId_key" ON "public"."Appointment"("slotId");

-- CreateIndex
CREATE INDEX "Appointment_plantId_startAt_idx" ON "public"."Appointment"("plantId", "startAt");

-- CreateIndex
CREATE INDEX "Appointment_plantId_vehicleId_startAt_idx" ON "public"."Appointment"("plantId", "vehicleId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_eventId_key" ON "public"."PaymentEvent"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_plantId_key" ON "public"."Membership"("userId", "plantId");

-- AddForeignKey
ALTER TABLE "public"."PlantVehicleType" ADD CONSTRAINT "PlantVehicleType_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "public"."Plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlantVehicleType" ADD CONSTRAINT "PlantVehicleType_vehicleTypeId_fkey" FOREIGN KEY ("vehicleTypeId") REFERENCES "public"."VehicleType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PriceRule" ADD CONSTRAINT "PriceRule_plantVehicleTypeId_fkey" FOREIGN KEY ("plantVehicleTypeId") REFERENCES "public"."PlantVehicleType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Line" ADD CONSTRAINT "Line_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "public"."Plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LineConfig" ADD CONSTRAINT "LineConfig_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "public"."Line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WeeklySchedule" ADD CONSTRAINT "WeeklySchedule_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "public"."Plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ScheduleException" ADD CONSTRAINT "ScheduleException_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "public"."Plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Slot" ADD CONSTRAINT "Slot_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "public"."Plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Slot" ADD CONSTRAINT "Slot_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "public"."Line"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Appointment" ADD CONSTRAINT "Appointment_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "public"."Plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Appointment" ADD CONSTRAINT "Appointment_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "public"."Line"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Appointment" ADD CONSTRAINT "Appointment_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "public"."Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Appointment" ADD CONSTRAINT "Appointment_vehicleTypeId_fkey" FOREIGN KEY ("vehicleTypeId") REFERENCES "public"."VehicleType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Appointment" ADD CONSTRAINT "Appointment_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "public"."Slot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AppointmentData" ADD CONSTRAINT "AppointmentData_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "public"."Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExpirationLog" ADD CONSTRAINT "ExpirationLog_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "public"."Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Membership" ADD CONSTRAINT "Membership_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "public"."Plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
