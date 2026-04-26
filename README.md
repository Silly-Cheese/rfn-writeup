# RFN Write-Up System

This repository contains a GitHub Pages friendly Firebase Firestore version of the RFN Write-Up Management System.

## Files

- `index.html` — main portal page
- `styles.css` — RFN navy/gold interface styling
- `app.js` — Firebase and Firestore logic

## Firestore collections used

The system automatically writes to these collections as records are created:

- `employees`
- `writeups`
- `auditLogs`
- `systemSettings`

## Roles

- `CEO` — create, view, edit, and delete write-ups for everyone
- `DisciplinePerms` — create and view write-ups for everyone
- `Employee` — view write-ups for self only

## First setup

When no employee records exist, the site shows a setup panel that lets you create the first CEO employee record.

After creating the first CEO, lock down your Firestore rules. The setup panel is intentionally blocked after at least one employee exists, but real protection must still come from Firestore Security Rules.

## Firestore record format

Employee documents use the Employee ID as the document ID:

```json
{
  "employeeId": "CEO-001",
  "employeeName": "Executive_Eagle",
  "role": "CEO",
  "active": true
}
```

Write-up documents are stored by generated WriteUp ID and include:

```json
{
  "writeUpId": "WU-...",
  "employeeId": "EMP-001",
  "employeeName": "Example User",
  "writeUpDate": "2026-04-26",
  "reason": "Reason text",
  "expiresMode": "Never",
  "expiresOn": "",
  "createdById": "CEO-001"
}
```

## Important security note

This is a static frontend application. Any true security must be enforced by Firestore Security Rules, not just JavaScript role checks. The JavaScript role checks control the interface, but Firestore Rules control what users can actually read or write.

For a stronger production version, add Firebase Authentication and map authenticated users to employee records.
