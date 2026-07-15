# Medvault - School Management Features Implementation Strategy

This document outlines the strategy for implementing three missing core school management functions identified during the integration of KCnotice and KCquotation.

---

## 1. Inventory & Asset Management (IT Committee)
**Goal:** Track school IT assets (iPads, Laptops, Projectors) and manage their lending lifecycle.

### Data Model (Prisma)
```prisma
model Asset {
  id           String      @id @default(cuid())
  tag          String      @unique // School Asset Tag
  name         String
  type         AssetType
  status       AssetStatus @default(AVAILABLE)
  location     String?
  assignedToId String?     // User ID if currently lent
  purchaseDate DateTime?
  lastChecked  DateTime?

  assignedTo   User?       @relation(fields: [assignedToId], references: [id])
  history      AssetLog[]
}

enum AssetType { IPAD, LAPTOP, PROJECTOR, OTHER }
enum AssetStatus { AVAILABLE, LENT, REPAIR, RETIRED }
```

### Implementation Steps
1. **Dashboard:** Create `/teacher/committee/it/inventory` to list all assets with filtering.
2. **Lending Workflow:** A QR code-based system where teachers scan an asset to "Check Out".
3. **Audit Log:** Automatically record every status change in `AssetLog`.

---

## 2. Facility & Room Booking (Administrative)
**Goal:** Centralized booking for computer labs, STEM rooms, and shared halls.

### Data Model (Prisma)
```prisma
model Resource {
  id          String    @id @default(cuid())
  name        String    // e.g., "Computer Lab (Room 201)"
  type        String    // e.g., "LAB"
  capacity    Int?
  bookings    Booking[]
}

model Booking {
  id         String   @id @default(cuid())
  resourceId String
  userId     String
  startTime  DateTime
  endTime    DateTime
  purpose    String?

  resource   Resource @relation(fields: [resourceId], references: [id])
  user       User     @relation(fields: [userId], references: [id])
}
```

### Implementation Steps
1. **Calendar View:** Use a library like `FullCalendar` or `react-day-picker` to show resource availability.
2. **Conflict Detection:** Backend logic to ensure `startTime` and `endTime` do not overlap for the same `resourceId`.
3. **Approvals:** (Optional) Set certain rooms to require IT/Admin approval before confirmation.

---

## 3. Student Holistic Portfolio (Reporting)
**Goal:** Generate a comprehensive report of a student's participation, behavior, and achievements.

### Implementation Strategy
Instead of a complex data model, this is a **Data Aggregation Service**.

1. **Aggregation Logic:**
   - Fetch `MissionSubmission` (Academic progress).
   - Fetch `ActivityAssignment` (Extracurricular participation).
   - Fetch `PointTransaction` (Reward/Service records).
   - Fetch `BehaviorRecord` (Conduct).
2. **PDF Generation:**
   - Use `jsPDF` or `react-pdf` to layout the aggregated data into a professional school-branded report.
   - Example Route: `/api/students/[id]/portfolio/export`.
3. **UI:** Add an "Export Portfolio" button to the Student Detail view in the Teacher Admin panel.

---

## Technical Recommendation for OCR (KCquotation)
To implement the OCR functionality in KCquotation:
- **Service:** Use **Claude 3.5 Sonnet Vision**.
- **Prompt:** "Extract the following fields from this quotation image into JSON format: vendor_name, total_amount, currency, date, and a list of items with their individual prices."
- **Benefit:** Unlike Tesseract (which requires heavy pre-processing and image cleanup), Claude Vision can handle complex table layouts and handwriting with high accuracy.
