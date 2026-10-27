import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatTime12, statusLabel } from "./attendanceHelpers";

// -----------------------------------------
// Branded Company Logo Header for PDFs
// -----------------------------------------
function drawCompanyHeader(pdfDoc, title, subtitle = "") {
  // Top brand accent bar
  pdfDoc.setFillColor(109, 58, 255);
  pdfDoc.rect(0, 0, pdfDoc.internal.pageSize.getWidth(), 4, "F");

  // Company Logo Emblem (Rounded badge + Geometric icon)
  pdfDoc.setFillColor(109, 58, 255);
  pdfDoc.roundedRect(14, 10, 14, 14, 3, 3, "F");

  // Inner layered logo mark
  pdfDoc.setDrawColor(255, 255, 255);
  pdfDoc.setLineWidth(0.9);
  pdfDoc.line(21, 13, 25.5, 15.5);
  pdfDoc.line(25.5, 15.5, 21, 18);
  pdfDoc.line(21, 18, 16.5, 15.5);
  pdfDoc.line(16.5, 15.5, 21, 13);

  pdfDoc.line(16.5, 18, 21, 20.5);
  pdfDoc.line(21, 20.5, 25.5, 18);

  // Company Name & Tagline
  pdfDoc.setTextColor(25, 20, 45);
  pdfDoc.setFont("helvetica", "bold");
  pdfDoc.setFontSize(14);
  pdfDoc.text("OFFICE PORTAL", 32, 16);

  pdfDoc.setTextColor(109, 58, 255);
  pdfDoc.setFont("helvetica", "bold");
  pdfDoc.setFontSize(8.5);
  pdfDoc.text("HR, ATTENDANCE & PAYROLL SYSTEM", 32, 21);

  // Right-aligned Generated Date
  const pageWidth = pdfDoc.internal.pageSize.getWidth();
  pdfDoc.setTextColor(100, 116, 139);
  pdfDoc.setFont("helvetica", "normal");
  pdfDoc.setFontSize(8.5);
  pdfDoc.text(
    `Generated: ${new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })}`,
    pageWidth - 14,
    16,
    { align: "right" }
  );

  // Divider line
  pdfDoc.setDrawColor(226, 232, 240);
  pdfDoc.setLineWidth(0.4);
  pdfDoc.line(14, 27, pageWidth - 14, 27);

  // Document Title & Subtitle
  pdfDoc.setTextColor(15, 23, 42);
  pdfDoc.setFont("helvetica", "bold");
  pdfDoc.setFontSize(13);
  pdfDoc.text(title, 14, 34);

  if (subtitle) {
    pdfDoc.setTextColor(71, 85, 105);
    pdfDoc.setFont("helvetica", "normal");
    pdfDoc.setFontSize(9.5);
    pdfDoc.text(subtitle, 14, 40);
    return 45;
  }

  return 39;
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

  const worksheet = XLSX.utils.json_to_sheet(data);
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

  const worksheet = XLSX.utils.json_to_sheet(data);
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

export function exportDailyToPDF(rows, filename, dateLabel) {
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
    styles: { fontSize: 9 },
    headStyles: { fillColor: [109, 58, 255] },
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

  const worksheet = XLSX.utils.json_to_sheet(data);
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

export function exportPayrollToPDF(rows, filename, monthLabel) {
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
    styles: { fontSize: 7.5, cellPadding: 2.2 },
    headStyles: { fillColor: [109, 58, 255], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  pdfDoc.save(`${filename}.pdf`);
}

// -----------------------------------------
// Individual Employee Salary Slip PDF (with Company Logo)
// -----------------------------------------
export function exportEmployeeSalarySlipPDF({ employee, stats, month }) {
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
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    headStyles: { fillColor: [30, 27, 75], textColor: 255 },
    columnStyles: {
      0: { fontStyle: "bold", fillColor: [248, 250, 252] },
      2: { fontStyle: "bold", fillColor: [248, 250, 252] },
    },
  });

  // Attendance & Off-Equivalents Summary Table
  const attStartY = (pdfDoc.lastAutoTable?.finalY || startY + 35) + 6;
  autoTable(pdfDoc, {
    startY: attStartY,
    head: [["Attendance Metric", "Count", "Policy / Rule", "Off-Equivalent Impact"]],
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
        "Late Arrivals (> 20m grace)",
        stats.lateCount ?? 0,
        "3 Lates = 1 Off",
        `${stats.offFromLates ?? 0} Off(s)`,
      ],
      [
        "Extreme Late Arrivals (> 50m)",
        stats.extremeLateCount ?? 0,
        "1 Extreme Late = 1 Off",
        `${stats.extremeLateCount ?? 0} Off(s)`,
      ],
      [
        "Early Leaves (Approved)",
        stats.earlyLeaveCount ?? 0,
        "2 Early Leaves = 1 Off",
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
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    headStyles: { fillColor: [109, 58, 255], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
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
        `${(stats.offFromLates ?? 0) + (stats.extremeLateCount ?? 0)} off-eq (${stats.lateCount ?? 0} late, ${stats.extremeLateCount ?? 0} ext. late)`,
        `- Rs. ${Math.round(stats.lateDeductionGross ?? 0).toLocaleString()}`,
      ],
      [
        "Early Leave Deduction (Gross)",
        `${stats.offFromEarlyLeaves ?? 0} off-eq (${stats.earlyLeaveCount ?? 0} early leaves)`,
        `- Rs. ${Math.round(stats.earlyLeaveDeductionGross ?? 0).toLocaleString()}`,
      ],
      [
        "Monthly Free Offs Relief (2 Free Offs Allowed)",
        `Up to 2 off-equivalents waived per month`,
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
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 },
    didParseCell: (data) => {
      if (data.section === "body" && data.row.index === 6) {
        data.cell.styles.fillColor = [109, 58, 255];
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize = 10;
      } else if (data.section === "body" && data.row.index === 5) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.textColor = [220, 38, 38];
      }
    },
  });

  // Footer signature line
  const finalY = (pdfDoc.lastAutoTable?.finalY || salStartY + 60) + 14;
  pdfDoc.setFontSize(8.5);
  pdfDoc.setTextColor(100, 116, 139);
  pdfDoc.text(
    "This is a computer-generated salary slip from Office Portal and does not require a physical signature.",
    14,
    finalY
  );

  const safeName = empName.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  pdfDoc.save(`salary-slip-${safeName}-${month}.pdf`);
}

// -----------------------------------------
// Print HTML Element
// -----------------------------------------
export function printElement(elementId) {
  const source = document.getElementById(elementId);
  if (!source) return;

  const clone = source.cloneNode(true);
  clone.querySelectorAll("[data-no-print]").forEach((el) => el.remove());

  const printWindow = window.open("", "_blank");
  printWindow.document.write(`
    <html><head><title>Office Portal Report</title>
    <style>
      body { font-family: sans-serif; padding: 20px; }
      .brand-head { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #6d3aff; padding-bottom: 12px; margin-bottom: 16px; }
      .brand-badge { width: 32px; height: 32px; border-radius: 8px; background: #6d3aff; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: bold; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #333; padding: 8px; text-align: left; font-size: 12px; }
      th { background: #f1f5f9; }
    </style></head>
    <body>
      <div class="brand-head">
        <div class="brand-badge">OP</div>
        <div>
          <strong style="font-size: 16px;">OFFICE PORTAL</strong><br/>
          <small style="color: #64748b;">Generated Report · ${new Date().toLocaleDateString()}</small>
        </div>
      </div>
      ${clone.innerHTML}
    </body></html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  printWindow.close();
}

// -----------------------------------------
// Employee Directory Rows & Exports
// -----------------------------------------
function buildDirectoryRows(employees) {
  return employees.map((emp) => ({
    Name: emp.personalInfo?.fullName || emp.name || "—",
    Email: emp.email || "—",
    Role: emp.role || "—",
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

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Employees");
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

export function exportDirectoryToPDF(employees, filename) {
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
    },
    headStyles: {
      fillColor: [109, 58, 255],
      textColor: 255,
      fontStyle: "bold",
      fontSize: 7,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
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
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance");
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

export function exportMonthToPDF(rows, filename, title) {
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
    styles: { fontSize: 9 },
    headStyles: { fillColor: [109, 58, 255] },
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

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Leave Requests");
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

export function exportLeavesToPDF(requests, filename, filterLabel = "All") {
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
    styles: { fontSize: 8 },
    headStyles: { fillColor: [109, 58, 255] },
  });

  pdfDoc.save(`${filename}.pdf`);
}
