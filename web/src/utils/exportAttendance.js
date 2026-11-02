import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  formatTime12,
  statusLabel,
  getActivePolicies,
} from "./attendanceHelpers";

// -----------------------------------------
// Preload & Convert /company-logo.webp -> PNG Data URL for jsPDF
// -----------------------------------------
let cachedLogoPngDataUrl = null;
let logoLoadPromise = null;

function ensureLogoLoaded() {
  if (cachedLogoPngDataUrl) return Promise.resolve(cachedLogoPngDataUrl);
  if (logoLoadPromise) return logoLoadPromise;

  if (typeof window === "undefined" || typeof Image === "undefined") {
    return Promise.resolve(null);
  }

  logoLoadPromise = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || 300;
        canvas.height = img.naturalHeight || 84;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        cachedLogoPngDataUrl = canvas.toDataURL("image/png");
        resolve(cachedLogoPngDataUrl);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = "/company-logo.webp";
  });

  return logoLoadPromise;
}

// Kick off preload immediately in browser
if (typeof window !== "undefined") {
  ensureLogoLoaded();
}

// Theme Colors (Logo-matched Dark Navy/Black & Crisp Monochrome)
const THEME_DARK = [15, 23, 42];       // #0f172a (Logo dark slate/black)
const THEME_CHARCOAL = [30, 41, 59];   // #1e293b (Secondary dark header)
const THEME_LIGHT_ROW = [248, 250, 252]; // #f8fafc

// -----------------------------------------
// Branded Company Logo Header for PDFs
// -----------------------------------------
function drawCompanyHeader(pdfDoc, title, subtitle = "") {
  const policies = getActivePolicies();
  const companyName = (policies.companyName || "THE NEXUS GROUP CO").toUpperCase();
  const pageWidth = pdfDoc.internal.pageSize.getWidth();

  // Dark Banner Header so the silver/white + cyan logo pops sharply
  pdfDoc.setFillColor(...THEME_DARK);
  pdfDoc.rect(0, 0, pageWidth, 24, "F");

  if (cachedLogoPngDataUrl) {
    try {
      // 300x84 aspect ratio -> 46mm x 12.9mm
      pdfDoc.addImage(cachedLogoPngDataUrl, "PNG", 14, 5.5, 46, 12.9);
    } catch {
      pdfDoc.setTextColor(255, 255, 255);
      pdfDoc.setFont("helvetica", "bold");
      pdfDoc.setFontSize(13);
      pdfDoc.text(companyName, 14, 14);
    }
  } else {
    pdfDoc.setTextColor(255, 255, 255);
    pdfDoc.setFont("helvetica", "bold");
    pdfDoc.setFontSize(13);
    pdfDoc.text(companyName, 14, 14);
  }

  // Right-aligned System Subtitle & Generated Date inside dark header
  pdfDoc.setTextColor(226, 232, 240);
  pdfDoc.setFont("helvetica", "bold");
  pdfDoc.setFontSize(8.5);
  pdfDoc.text("HR, ATTENDANCE & PAYROLL PORTAL", pageWidth - 14, 11, {
    align: "right",
  });

  pdfDoc.setTextColor(148, 163, 184);
  pdfDoc.setFont("helvetica", "normal");
  pdfDoc.setFontSize(8);
  pdfDoc.text(
    `Generated: ${new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })}`,
    pageWidth - 14,
    17,
    { align: "right" }
  );

  // Document Title & Subtitle below banner
  pdfDoc.setTextColor(...THEME_DARK);
  pdfDoc.setFont("helvetica", "bold");
  pdfDoc.setFontSize(13);
  pdfDoc.text(title, 14, 33);

  if (subtitle) {
    pdfDoc.setTextColor(71, 85, 105);
    pdfDoc.setFont("helvetica", "normal");
    pdfDoc.setFontSize(9.5);
    pdfDoc.text(subtitle, 14, 39);

    pdfDoc.setDrawColor(203, 213, 225);
    pdfDoc.setLineWidth(0.35);
    pdfDoc.line(14, 42, pageWidth - 14, 42);
    return 46;
  }

  pdfDoc.setDrawColor(203, 213, 225);
  pdfDoc.setLineWidth(0.35);
  pdfDoc.line(14, 36, pageWidth - 14, 36);
  return 40;
}

// -----------------------------------------
// Branded Excel Sheet Builder
// -----------------------------------------
function createBrandedWorksheet(rows, reportTitle) {
  const policies = getActivePolicies();
  const companyName = (policies.companyName || "THE NEXUS GROUP CO").toUpperCase();
  const generatedStr = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const bannerRows = [
    [`${companyName} — OFFICIAL REPORT`],
    [`${reportTitle} (Generated: ${generatedStr})`],
    [],
  ];

  const ws = XLSX.utils.aoa_to_sheet(bannerRows);
  XLSX.utils.sheet_add_json(ws, rows, { origin: "A4", skipHeader: false });
  return ws;
}

// -----------------------------------------
// Attendance Row Formatter
// -----------------------------------------
function formatRow(r) {
  return {
    date: r.date || "—",
    time: r.checkInTime ? formatTime12(r.checkInTime) : "—",
    status: statusLabel(r),
  };
}

// -----------------------------------------
// Attendance → CSV
// -----------------------------------------
export function exportToCSV(records, filename) {
  const header = "Date,Check-in Time,Status\n";

  const rows = records
    .map((r) => {
      const row = formatRow(r);
      return `"${row.date}","${row.time}","${row.status}"`;
    })
    .join("\n");

  const blob = new Blob([header + rows], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `${filename}.csv`;
  link.click();

  URL.revokeObjectURL(url);
}

// -----------------------------------------
// Attendance → Excel
// -----------------------------------------
export function exportToExcel(records, filename) {
  const data = records.map((r) => {
    const row = formatRow(r);

    return {
      Date: row.date,
      "Check-in Time": row.time,
      Status: row.status,
    };
  });

  const worksheet = createBrandedWorksheet(data, "Attendance Report");
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance");
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

// -----------------------------------------
// Daily Attendance → Excel / CSV / PDF
// -----------------------------------------
export function exportDailyToExcel(rows, filename) {
  const data = rows.map((r) => ({
    Employee: r.name || "—",
    Status: r.displayStatus || "—",
    "Check-in Time": r.time || "—",
  }));

  const worksheet = createBrandedWorksheet(data, "Daily Attendance Report");
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "Daily Attendance");
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

export function exportDailyToCSV(rows, filename) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = "Employee,Status,Check-in Time\n";
  const body = rows
    .map((r) => [esc(r.name), esc(r.displayStatus), esc(r.time || "-")].join(","))
    .join("\n");

  const blob = new Blob([header + body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function exportDailyToPDF(rows, filename, dateLabel) {
  await ensureLogoLoaded();
  const pdfDoc = new jsPDF();
  const startY = drawCompanyHeader(
    pdfDoc,
    "Daily Attendance Report",
    `Date: ${dateLabel}`
  );

  autoTable(pdfDoc, {
    startY,
    head: [["Employee", "Status", "Check-in Time"]],
    body: rows.map((r) => [r.name, r.displayStatus, r.time || "-"]),
    styles: { fontSize: 9, textColor: THEME_DARK },
    headStyles: { fillColor: THEME_DARK, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: THEME_LIGHT_ROW },
  });

  pdfDoc.save(`${filename}.pdf`);
}

// -----------------------------------------
// Monthly Payroll → Excel / CSV / PDF
// -----------------------------------------
export function exportPayrollToExcel(rows, filename) {
  const data = rows.map((r) => ({
    Employee: r.name || "—",
    Month: r.month || "—",
    "Base Salary (Rs.)": Math.round(r.baseSalary ?? 0),
    Present: r.presentCount ?? 0,
    Late: r.lateCount ?? 0,
    "Extreme Late": r.extremeLateCount ?? 0,
    Absent: r.absentCount ?? 0,
    "Approved Leaves": r.approvedLeaveCount ?? 0,
    "Early Leaves": r.earlyLeaveCount ?? 0,
    "Total Off-Equivalents": r.offEquivalents ?? 0,
    "Deductible Offs": r.deductibleOffs ?? 0,
    "Absent Deduction (Rs.)": Math.round(r.absentDeductionGross ?? 0),
    "Late Deduction (Rs.)": Math.round(r.lateDeductionGross ?? 0),
    "Early Leave Deduction (Rs.)": Math.round(r.earlyLeaveDeductionGross ?? 0),
    "Total Deduction (Rs.)": Math.round(r.deduction ?? 0),
    "Net Salary (Rs.)": Math.round(r.netSalary ?? 0),
    "Payment Method": r.method || "—",
    "Bank/Wallet": r.providerName || "—",
    "Account Title": r.accountTitle || "—",
    "Account Number": r.accountNumber || "—",
    IBAN: r.iban || "—",
  }));

  const worksheet = createBrandedWorksheet(data, "Monthly Payroll Statement");
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "Payroll");
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

export function exportPayrollToCSV(rows, filename) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const headers = [
    "Employee",
    "Month",
    "Base Salary",
    "Present",
    "Late",
    "Extreme Late",
    "Absent",
    "Deductible Offs",
    "Total Deduction",
    "Net Salary",
    "Payment Method",
    "Bank/Wallet",
    "Account Title",
    "Account Number",
    "IBAN",
  ];
  const body = rows
    .map((r) =>
      [
        r.name || "—",
        r.month || "—",
        Math.round(r.baseSalary ?? 0),
        r.presentCount ?? 0,
        r.lateCount ?? 0,
        r.extremeLateCount ?? 0,
        r.absentCount ?? 0,
        r.deductibleOffs ?? 0,
        Math.round(r.deduction ?? 0),
        Math.round(r.netSalary ?? 0),
        r.method || "—",
        r.providerName || "—",
        r.accountTitle || "—",
        r.accountNumber || "—",
        r.iban || "—",
      ]
        .map(esc)
        .join(",")
    )
    .join("\n");

  const blob = new Blob([headers.map(esc).join(",") + "\n" + body], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function exportPayrollToPDF(rows, filename, monthLabel) {
  await ensureLogoLoaded();
  const pdfDoc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const totalNet = rows.reduce((sum, r) => sum + (Number(r.netSalary) || 0), 0);
  const totalDeducted = rows.reduce((sum, r) => sum + (Number(r.deduction) || 0), 0);

  const startY = drawCompanyHeader(
    pdfDoc,
    `Monthly Payroll Statement — ${monthLabel}`,
    `Total Employees: ${rows.length}   |   Total Deductions: Rs. ${Math.round(totalDeducted).toLocaleString()}   |   Total Net Payroll: Rs. ${Math.round(totalNet).toLocaleString()}`
  );

  autoTable(pdfDoc, {
    startY,
    head: [
      [
        "Employee",
        "Base Salary",
        "Present",
        "Late / Ext",
        "Absent",
        "Ded. Offs",
        "Salary Cut",
        "Net Payable",
        "Method",
        "Bank / Wallet",
        "Account Title",
        "Account Number",
      ],
    ],
    body: rows.map((r) => [
      r.name || "—",
      `Rs. ${Math.round(r.baseSalary ?? 0).toLocaleString()}`,
      r.presentCount ?? 0,
      `${r.lateCount ?? 0} / ${r.extremeLateCount ?? 0}`,
      r.absentCount ?? 0,
      r.deductibleOffs ?? 0,
      `Rs. ${Math.round(r.deduction ?? 0).toLocaleString()}`,
      `Rs. ${Math.round(r.netSalary ?? 0).toLocaleString()}`,
      r.method || "—",
      r.providerName || "—",
      r.accountTitle || "—",
      r.accountNumber || "—",
    ]),
    styles: { fontSize: 7.5, cellPadding: 2.2, textColor: THEME_DARK },
    headStyles: { fillColor: THEME_DARK, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: THEME_LIGHT_ROW },
  });

  pdfDoc.save(`${filename}.pdf`);
}

// -----------------------------------------
// Individual Employee Salary Slip PDF (with Company Logo & Dynamic Policies)
// -----------------------------------------
export async function exportEmployeeSalarySlipPDF({ employee, stats, month }) {
  await ensureLogoLoaded();
  const policies = getActivePolicies();

  const latesPerOff = stats?.latesPerOff ?? policies.latesPerOff;
  const extremeLatesPerOff =
    stats?.extremeLatesPerOff ?? policies.extremeLatesPerOff;
  const earlyLeavesPerOff =
    stats?.earlyLeavesPerOff ?? policies.earlyLeavesPerOff;
  const freeOffsAllowed = stats?.freeOffsAllowed ?? policies.freeOffsPerMonth;
  const graceMinutes = stats?.graceMinutes ?? policies.graceMinutes;
  const extremeWindow =
    graceMinutes +
    (stats?.extremeLateAfterGraceMinutes ??
      policies.extremeLateAfterGraceMinutes);
  const offFromExtremeLates =
    stats?.offFromExtremeLates ??
    Math.floor((stats?.extremeLateCount ?? 0) / extremeLatesPerOff);

  const pdfDoc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const empName =
    employee?.personalInfo?.fullName ||
    employee?.fullName ||
    employee?.name ||
    employee?.email ||
    "Employee";

  const startY = drawCompanyHeader(
    pdfDoc,
    `Employee Salary Slip & Payroll Report`,
    `Payroll Month: ${month}   |   Employee: ${empName}`
  );

  // Employee & Bank Info Table
  autoTable(pdfDoc, {
    startY,
    head: [["Employee Information", "Details", "Payment / Bank Details", "Account Info"]],
    body: [
      [
        "Full Name",
        empName,
        "Payment Method",
        (employee?.bankDetails?.method || "Bank").toUpperCase(),
      ],
      [
        "Email",
        employee?.email || "—",
        "Bank / Wallet",
        employee?.bankDetails?.providerName || "—",
      ],
      [
        "CNIC",
        employee?.personalInfo?.cnic || "—",
        "Account Title",
        employee?.bankDetails?.accountTitle || "—",
      ],
      [
        "Phone",
        employee?.personalInfo?.phone || "—",
        "Account No / IBAN",
        employee?.bankDetails?.iban || employee?.bankDetails?.accountNumber || "—",
      ],
    ],
    styles: { fontSize: 8.5, cellPadding: 2.5, textColor: THEME_DARK },
    headStyles: { fillColor: THEME_DARK, textColor: 255 },
    columnStyles: {
      0: { fontStyle: "bold", fillColor: THEME_LIGHT_ROW },
      2: { fontStyle: "bold", fillColor: THEME_LIGHT_ROW },
    },
  });

  // Attendance & Off-Equivalents Summary Table
  const attStartY = (pdfDoc.lastAutoTable?.finalY || startY + 35) + 6;
  autoTable(pdfDoc, {
    startY: attStartY,
    head: [["Attendance Metric", "Count", "Company Policy Rule", "Off-Equivalent Impact"]],
    body: [
      [
        "Scheduled Working Days (Month)",
        stats.workingDaysInMonth ?? 0,
        "Standard monthly schedule",
        `Per-Day Rate: Rs. ${Math.round(stats.perDayRate ?? 0).toLocaleString()}`,
      ],
      [
        "Days Present (Total)",
        stats.presentCount ?? 0,
        `On-time arrivals: ${stats.onTimeCount ?? 0}`,
        "0 Offs",
      ],
      [
        `Late Arrivals (> ${graceMinutes}m grace)`,
        stats.lateCount ?? 0,
        `${latesPerOff} Lates = 1 Off`,
        `${stats.offFromLates ?? 0} Off(s)`,
      ],
      [
        `Extreme Late Arrivals (> ${extremeWindow}m)`,
        stats.extremeLateCount ?? 0,
        `${extremeLatesPerOff} Extreme Late(s) = 1 Off`,
        `${offFromExtremeLates} Off(s)`,
      ],
      [
        "Early Leaves (Approved)",
        stats.earlyLeaveCount ?? 0,
        `${earlyLeavesPerOff} Early Leaves = 1 Off`,
        `${stats.offFromEarlyLeaves ?? 0} Off(s)`,
      ],
      [
        "Unapproved Absences (Offs)",
        stats.absentCount ?? 0,
        "1 Absent = 1 Off",
        `${stats.absentCount ?? 0} Off(s)`,
      ],
      [
        "Approved Full-Day Leaves",
        stats.approvedLeaveCount ?? 0,
        "Approved by Admin",
        "0 Offs (Exempt)",
      ],
    ],
    styles: { fontSize: 8.5, cellPadding: 2.5, textColor: THEME_DARK },
    headStyles: { fillColor: THEME_CHARCOAL, textColor: 255 },
    alternateRowStyles: { fillColor: THEME_LIGHT_ROW },
  });

  // Salary Calculation & Deduction Breakdown Table
  const salStartY = (pdfDoc.lastAutoTable?.finalY || attStartY + 55) + 6;
  autoTable(pdfDoc, {
    startY: salStartY,
    head: [["Salary & Deduction Breakdown", "Calculation", "Amount (PKR)"]],
    body: [
      [
        "Monthly Base Salary",
        `${stats.workingDaysInMonth ?? 0} working days @ Rs. ${Math.round(stats.perDayRate ?? 0).toLocaleString()}/day`,
        `Rs. ${Math.round(stats.baseSalary ?? employee?.salary ?? 0).toLocaleString()}`,
      ],
      [
        "Absent / Unapproved Off Deduction (Gross)",
        `${stats.absentCount ?? 0} absent(s) × Rs. ${Math.round(stats.perDayRate ?? 0).toLocaleString()}`,
        `- Rs. ${Math.round(stats.absentDeductionGross ?? 0).toLocaleString()}`,
      ],
      [
        "Late & Extreme-Late Deduction (Gross)",
        `${(stats.offFromLates ?? 0) + offFromExtremeLates} off-eq (${stats.lateCount ?? 0} late, ${stats.extremeLateCount ?? 0} ext. late)`,
        `- Rs. ${Math.round(stats.lateDeductionGross ?? 0).toLocaleString()}`,
      ],
      [
        "Early Leave Deduction (Gross)",
        `${stats.offFromEarlyLeaves ?? 0} off-eq (${stats.earlyLeaveCount ?? 0} early leaves)`,
        `- Rs. ${Math.round(stats.earlyLeaveDeductionGross ?? 0).toLocaleString()}`,
      ],
      [
        `Monthly Free Offs Relief (${freeOffsAllowed} Free Offs Allowed)`,
        `Up to ${freeOffsAllowed} off-equivalent(s) waived per month`,
        `+ Rs. ${Math.round(stats.freeOffCredit ?? 0).toLocaleString()}`,
      ],
      [
        "Total Deductible Offs & Final Salary Cut",
        `${stats.deductibleOffs ?? 0} net deductible off(s) (out of ${stats.offEquivalents ?? 0} total off-eq)`,
        `- Rs. ${Math.round(stats.deduction ?? 0).toLocaleString()}`,
      ],
      [
        "NET PAYABLE SALARY",
        `For Month ${month}`,
        `Rs. ${Math.round(stats.netSalary ?? 0).toLocaleString()}`,
      ],
    ],
    styles: { fontSize: 9, cellPadding: 3, textColor: THEME_DARK },
    headStyles: { fillColor: THEME_DARK, textColor: 255 },
    didParseCell: (data) => {
      if (data.section === "body" && data.row.index === 6) {
        data.cell.styles.fillColor = THEME_DARK;
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize = 10;
      } else if (data.section === "body" && data.row.index === 5) {
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  // Footer signature line
  const finalY = (pdfDoc.lastAutoTable?.finalY || salStartY + 60) + 14;
  pdfDoc.setFontSize(8.5);
  pdfDoc.setTextColor(100, 116, 139);
  pdfDoc.text(
    `This is a computer-generated salary slip from ${policies.companyName || "The Nexus Group Co"} and does not require a physical signature.`,
    14,
    finalY
  );

  const safeName = empName.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  pdfDoc.save(`salary-slip-${safeName}-${month}.pdf`);
}

// -----------------------------------------
// Print HTML Element (with Company Logo & Black/White Theme)
// -----------------------------------------
export function printElement(elementId) {
  const source = document.getElementById(elementId);
  if (!source) return;

  const policies = getActivePolicies();
  const companyName = (policies.companyName || "THE NEXUS GROUP CO").toUpperCase();
  const logoUrl = `${window.location.origin}/company-logo.webp`;

  const clone = source.cloneNode(true);
  clone.querySelectorAll("[data-no-print]").forEach((el) => el.remove());

  const printWindow = window.open("", "_blank");
  printWindow.document.write(`
    <html><head><title>${companyName} — Report</title>
    <style>
      body { font-family: Arial, Helvetica, sans-serif; padding: 20px; color: #0f172a; }
      .brand-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: #0f172a;
        color: #ffffff;
        padding: 14px 20px;
        border-radius: 6px;
        margin-bottom: 18px;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .brand-logo { height: 42px; width: auto; object-fit: contain; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #1e293b; padding: 8px; text-align: left; font-size: 12px; color: #0f172a; }
      th {
        background: #0f172a;
        color: #ffffff;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      tr:nth-child(even) td { background: #f8fafc; }
    </style></head>
    <body>
      <div class="brand-head">
        <img src="${logoUrl}" alt="${companyName}" class="brand-logo" />
        <div style="text-align: right;">
          <strong style="font-size: 14px; letter-spacing: 0.5px;">${companyName}</strong><br/>
          <small style="color: #cbd5e1;">Official Report · ${new Date().toLocaleDateString("en-GB")}</small>
        </div>
      </div>
      ${clone.innerHTML}
    </body></html>
  `);
  printWindow.document.close();
  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  }, 350);
}

// -----------------------------------------
// Employee Directory Rows & Exports
// -----------------------------------------
function buildDirectoryRows(employees) {
  return employees.map((emp) => ({
    Name: emp.personalInfo?.fullName || emp.name || "—",
    Email: emp.email || "—",
    Role: emp.role || "—",
    Status: emp.isActive === false ? "Deactivated" : "Active",
    "Base Salary": emp.salary ?? 0,
    Phone: emp.personalInfo?.phone || "—",
    CNIC: emp.personalInfo?.cnic || "—",
    DOB: emp.personalInfo?.dob || "—",
    Address: emp.personalInfo?.address || "—",
    "Payment Method": emp.bankDetails?.method || "—",
    "Bank/Wallet": emp.bankDetails?.providerName || "—",
    "Account Title": emp.bankDetails?.accountTitle || "—",
    "Account Number": emp.bankDetails?.accountNumber || "—",
    IBAN: emp.bankDetails?.iban || "—",
  }));
}

export function exportDirectoryToCSV(employees, filename) {
  const rows = buildDirectoryRows(employees);
  if (rows.length === 0) return;

  const headers = Object.keys(rows[0]);
  const csvRows = [
    headers.map((header) => `"${header}"`).join(","),
    ...rows.map((row) =>
      headers
        .map((header) => `"${String(row[header]).replace(/"/g, '""')}"`)
        .join(",")
    ),
  ];

  const blob = new Blob([csvRows.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportDirectoryToExcel(employees, filename) {
  const rows = buildDirectoryRows(employees);
  if (rows.length === 0) return;

  const worksheet = createBrandedWorksheet(rows, "All Employees Directory");
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Employees");
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

export async function exportDirectoryToPDF(employees, filename) {
  await ensureLogoLoaded();
  const rows = buildDirectoryRows(employees);
  if (rows.length === 0) return;

  const headers = Object.keys(rows[0]);
  const pdfDoc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const startY = drawCompanyHeader(
    pdfDoc,
    "All Employees Directory",
    `Total Registered Employees: ${rows.length}`
  );

  autoTable(pdfDoc, {
    startY,
    head: [headers],
    body: rows.map((row) => headers.map((header) => row[header])),
    styles: {
      fontSize: 6.5,
      cellPadding: 2,
      overflow: "linebreak",
      textColor: THEME_DARK,
    },
    headStyles: {
      fillColor: THEME_DARK,
      textColor: 255,
      fontStyle: "bold",
      fontSize: 7,
    },
    alternateRowStyles: {
      fillColor: THEME_LIGHT_ROW,
    },
    margin: { top: 25, right: 8, bottom: 10, left: 8 },
  });

  pdfDoc.save(`${filename}.pdf`);
}

// -----------------------------------------
// Monthly Attendance Exports
// -----------------------------------------
function monthTable(rows) {
  return rows.map((r) => [r.date, r.day, r.label, r.time || "-", r.note || "-"]);
}

export function exportMonthToCSV(rows, filename) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = "Date,Day,Status,Check-in,Notes\n";
  const body = monthTable(rows).map((r) => r.map(esc).join(",")).join("\n");

  const blob = new Blob([header + body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportMonthToExcel(rows, filename) {
  const data = rows.map((r) => ({
    Date: r.date,
    Day: r.day,
    Status: r.label,
    "Check-in": r.time || "-",
    Notes: r.note || "-",
  }));
  const worksheet = createBrandedWorksheet(data, "Monthly Attendance Report");
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance");
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

export async function exportMonthToPDF(rows, filename, title) {
  await ensureLogoLoaded();
  const pdfDoc = new jsPDF();
  const startY = drawCompanyHeader(
    pdfDoc,
    "Monthly Attendance Report",
    title
  );

  autoTable(pdfDoc, {
    startY,
    head: [["Date", "Day", "Status", "Check-in", "Notes"]],
    body: monthTable(rows),
    styles: { fontSize: 9, textColor: THEME_DARK },
    headStyles: { fillColor: THEME_DARK, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: THEME_LIGHT_ROW },
  });

  pdfDoc.save(`${filename}.pdf`);
}

// -----------------------------------------
// Leave Requests Exports (CSV / Excel / PDF)
// -----------------------------------------
export function exportLeavesToExcel(requests, filename) {
  const data = requests.map((r) => ({
    Employee: r.employeeName || "—",
    Email: r.employeeEmail || "—",
    Type: r.type === "earlyLeave" ? "Early Leave" : "Full Leave",
    Date:
      r.type === "earlyLeave"
        ? r.date || "—"
        : `${r.startDate || "—"} to ${r.endDate || "—"}`,
    "Departure Time": r.earlyLeaveTime || "—",
    Reason: r.reason || "—",
    Status: r.status || "pending",
    "Admin Comment": r.adminComment || "—",
  }));

  const worksheet = createBrandedWorksheet(
    data,
    "Employee Leave & Early Leave Report"
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Leave Requests");
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

export async function exportLeavesToPDF(requests, filename, filterLabel = "All") {
  await ensureLogoLoaded();
  const pdfDoc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const startY = drawCompanyHeader(
    pdfDoc,
    "Employee Leave & Early Leave Report",
    `Filter: ${filterLabel.toUpperCase()}   |   Total Requests: ${requests.length}`
  );

  autoTable(pdfDoc, {
    startY,
    head: [
      [
        "Employee",
        "Email",
        "Type",
        "Date / Range",
        "Departure",
        "Reason",
        "Status",
        "Admin Comment",
      ],
    ],
    body: requests.map((r) => [
      r.employeeName || "—",
      r.employeeEmail || "—",
      r.type === "earlyLeave" ? "Early Leave" : "Full Leave",
      r.type === "earlyLeave"
        ? r.date || "—"
        : `${r.startDate || "—"} to ${r.endDate || "—"}`,
      r.earlyLeaveTime || "—",
      r.reason || "—",
      (r.status || "pending").toUpperCase(),
      r.adminComment || "—",
    ]),
    styles: { fontSize: 8, textColor: THEME_DARK },
    headStyles: { fillColor: THEME_DARK, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: THEME_LIGHT_ROW },
  });

  pdfDoc.save(`${filename}.pdf`);
}
