"use client";

import { useMemo, useState } from "react";
import { useContactDirectory } from "@/hooks/use-contact-directory";
import { useEncounterNotes } from "@/hooks/use-encounter-notes";
import { useOfficeSettings } from "@/hooks/use-office-settings";
import { usePatientBilling } from "@/hooks/use-patient-billing";
import { patients as seedPatients } from "@/lib/mock-data";
import { loadPatientDiagnosesMap, type PatientDiagnosisEntry } from "@/lib/patient-diagnoses";

type BillingPatient = {
  id: string;
  fullName: string;
  phone: string;
  dob: string;
  dateOfLoss: string;
  attorney: string;
};

type BillingPatientRow = BillingPatient & {
  caseNumber: string;
  chargeCount: number;
  chargeTotal: number;
};

type EncounterChargeLine = {
  id: string;
  encounterDate: string;
  provider: string;
  appointmentType: string;
  procedureCode: string;
  description: string;
  units: number;
  unitPrice: number;
  lineTotal: number;
};

type SettlementAdjustmentLine = {
  id: string;
  label: string;
  amount: number;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function normalizeLookupValue(value: string) {
  return value.trim().toLowerCase();
}

function toUsDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    return trimmed;
  }
  if (/^\d{2}\/\d{2}\/\d{2}$/.test(trimmed)) {
    const [month, day, year] = trimmed.split("/");
    return `${month}/${day}/20${year}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split("-");
    return `${month}/${day}/${year}`;
  }
  return trimmed;
}

function formatUsDateInput(rawValue: string) {
  const digits = rawValue.replace(/\D/g, "").slice(0, 8);
  if (!digits) {
    return "";
  }
  if (digits.length <= 2) {
    return digits;
  }
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function toSortStamp(dateValue: string) {
  const match = toUsDate(dateValue).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    return 0;
  }
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const stamp = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
  return Number.isFinite(stamp) ? stamp : 0;
}

function getNames(fullName: string) {
  const [lastName = "", firstName = ""] = fullName.split(",").map((value) => value.trim());
  return { firstName, lastName };
}

function buildCaseNumber(dateOfLoss: string, fullName: string) {
  const formattedDate = toUsDate(dateOfLoss);
  const dateMatch = formattedDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!dateMatch) {
    return "";
  }
  const { firstName, lastName } = getNames(fullName);
  const month = dateMatch[1];
  const day = dateMatch[2];
  const year = dateMatch[3].slice(-2);
  const cleanLast = lastName.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 2);
  const cleanFirst = firstName.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 2);
  return `${month}${day}${year}${cleanLast}${cleanFirst}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildPrintHtml(config: {
  officeName: string;
  officeAddress: string;
  officePhone: string;
  officeFax: string;
  officeEmail: string;
  logoDataUrl: string;
  patientName: string;
  patientPhone: string;
  patientDob: string;
  patientDoi: string;
  caseNumber: string;
  attorneyName: string;
  attorneyPhone: string;
  providerName: string;
  statementDate: string;
  diagnoses: PatientDiagnosisEntry[];
  rows: EncounterChargeLine[];
  total: number;
  totalPaid: number;
  totalAdjustments: number;
  remainingBalance: number;
  settlementAdjustments: SettlementAdjustmentLine[];
}) {
  const diagnosisMarkup = config.diagnoses
    .map(
      (row, index) => `<tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(row.code)}</td>
      <td>${escapeHtml(row.description)}</td>
    </tr>`,
    )
    .join("");

  const rowMarkup = config.rows
    .map(
      (row, index) => `<tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(row.encounterDate)}</td>
      <td>${escapeHtml(`${row.procedureCode} - ${row.description}`)}</td>
      <td>11</td>
      <td>${row.units}</td>
      <td>${escapeHtml(formatMoney(row.lineTotal))}</td>
      <td>${escapeHtml(formatMoney(0))}</td>
    </tr>`,
    )
    .join("");

  const settlementRows = config.settlementAdjustments
    .map(
      (row) => `<tr>
      <td>${escapeHtml(row.label)}</td>
      <td>${escapeHtml(formatMoney(row.amount))}</td>
    </tr>`,
    )
    .join("");

  const logoMarkup = config.logoDataUrl.trim()
    ? `<div class="logo-wrap"><img alt="Office Logo" src="${escapeHtml(config.logoDataUrl)}" /></div>`
    : "";

  const diagnosisSection = config.diagnoses.length
    ? `
      <section class="section">
        <h3>Diagnoses</h3>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Code</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            ${diagnosisMarkup}
          </tbody>
        </table>
      </section>
    `
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Statement for Reimbursement</title>
    <style>
      body {
        margin: 0;
        padding: 24px;
        color: #121a27;
        background: #fff;
        font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      }
      .wrapper {
        max-width: 980px;
        margin: 0 auto;
      }
      .header-grid {
        display: grid;
        grid-template-columns: 170px minmax(0, 1fr);
        gap: 16px;
        align-items: start;
      }
      .statement-date {
        border: 1px solid #222;
      }
      .statement-date .label {
        border-bottom: 1px solid #222;
        padding: 8px;
        font-size: 14px;
        text-align: center;
      }
      .statement-date .value {
        padding: 12px 8px;
        font-size: 30px;
        font-weight: 700;
        text-align: center;
      }
      .office {
        text-align: center;
      }
      .office h1 {
        margin: 0;
        font-size: 42px;
        font-weight: 800;
      }
      .office p {
        margin: 4px 0;
        font-size: 14px;
      }
      .logo-wrap {
        margin-bottom: 10px;
        display: flex;
        justify-content: flex-end;
      }
      .logo-wrap img {
        max-height: 74px;
        width: auto;
        object-fit: contain;
      }
      .patient-mail {
        margin-top: 18px;
        font-size: 18px;
        line-height: 1.4;
      }
      .title {
        margin-top: 30px;
        text-align: center;
        font-size: 46px;
      }
      .meta-row {
        margin-top: 14px;
        border-top: 3px solid #111;
        padding-top: 10px;
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 10px;
        font-size: 14px;
      }
      .section {
        margin-top: 14px;
      }
      .section h3 {
        margin: 0 0 8px 0;
        font-size: 30px;
      }
      .settlement-grid {
        margin-top: 12px;
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 280px);
        gap: 12px;
        align-items: start;
      }
      .settlement-box {
        border: 1px solid #222;
        padding: 10px;
      }
      .settlement-box h4 {
        margin: 0 0 8px 0;
        font-size: 18px;
      }
      .settlement-box dl {
        margin: 0;
        display: grid;
        gap: 4px;
      }
      .settlement-box .row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th,
      td {
        border: 1px solid #222;
        padding: 6px 8px;
        font-size: 13px;
        vertical-align: top;
        text-align: left;
      }
      th {
        background: #f7f7f7;
      }
      .totals {
        margin-top: 12px;
        display: flex;
        justify-content: flex-end;
      }
      .total-box {
        border: 1px solid #222;
        padding: 10px 14px;
        font-size: 16px;
        font-weight: 700;
      }
      @page {
        size: Letter;
        margin: 0.5in;
      }
    </style>
  </head>
  <body>
    <main class="wrapper">
      <div class="header-grid">
        <div class="statement-date">
          <div class="label">Statement Date</div>
          <div class="value">${escapeHtml(config.statementDate)}</div>
        </div>
        <div class="office">
          ${logoMarkup}
          <h1>${escapeHtml(config.officeName)}</h1>
          <p>${escapeHtml(config.officeAddress)}</p>
          <p>(${escapeHtml(config.officePhone)})</p>
          ${config.officeFax.trim() ? `<p>Fax: ${escapeHtml(config.officeFax)}</p>` : ""}
          ${config.officeEmail.trim() ? `<p>${escapeHtml(config.officeEmail)}</p>` : ""}
        </div>
      </div>

      <div class="patient-mail">
        <strong>${escapeHtml(config.patientName)}</strong><br />
        ${config.patientPhone ? `Phone: ${escapeHtml(config.patientPhone)}<br />` : ""}
      </div>

      <div class="title">Statement for Reimbursement</div>

      <div class="meta-row">
        <div>
          <strong>Patient:</strong> ${escapeHtml(config.patientName)}${config.caseNumber ? ` - ${escapeHtml(config.caseNumber)}` : ""}<br />
          <strong>DOB:</strong> ${escapeHtml(config.patientDob || "-")}<br />
          <strong>Date of Injury:</strong> ${escapeHtml(config.patientDoi || "-")}<br />
          <strong>Attorney:</strong> ${escapeHtml(config.attorneyName || "-")}<br />
          <strong>Attorney Phone:</strong> ${escapeHtml(config.attorneyPhone || "-")}
        </div>
        <div style="text-align:right">
          <strong>Provider:</strong> ${escapeHtml(config.providerName || "-")}
        </div>
      </div>

      ${diagnosisSection}

      <section class="section">
        <h3>Procedures</h3>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Date</th>
              <th>Service</th>
              <th>POS</th>
              <th>Un</th>
              <th>Charge</th>
              <th>Tax</th>
            </tr>
          </thead>
          <tbody>
            ${rowMarkup}
          </tbody>
        </table>
      </section>

      <div class="totals">
        <div class="total-box">Total: ${escapeHtml(formatMoney(config.total))}</div>
      </div>

      <section class="settlement-grid">
        ${
          config.settlementAdjustments.length > 0
            ? `<div class="settlement-box">
          <h4>Close-Out Adjustments</h4>
          <table>
            <thead>
              <tr>
                <th>Adjustment</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              ${settlementRows}
            </tbody>
          </table>
        </div>`
            : "<div></div>"
        }
        <div class="settlement-box">
          <h4>Close-Out Summary</h4>
          <dl>
            <div class="row"><dt>Billed:</dt><dd>${escapeHtml(formatMoney(config.total))}</dd></div>
            <div class="row"><dt>Paid:</dt><dd>${escapeHtml(formatMoney(config.totalPaid))}</dd></div>
            <div class="row"><dt>Adjustments:</dt><dd>${escapeHtml(formatMoney(config.totalAdjustments))}</dd></div>
            <div class="row"><dt>Balance:</dt><dd>${escapeHtml(formatMoney(config.remainingBalance))}</dd></div>
          </dl>
        </div>
      </section>
    </main>
  </body>
</html>`;
}

function printHtmlWithIframeFallback(printableHtml: string) {
  const popup = window.open("", "_blank");
  if (popup) {
    popup.document.open();
    popup.document.write(printableHtml);
    popup.document.close();
    if (popup.document.readyState === "complete") {
      setTimeout(() => {
        popup.focus();
        popup.print();
      }, 80);
    } else {
      popup.onload = () => {
        setTimeout(() => {
          popup.focus();
          popup.print();
        }, 80);
      };
    }
    return true;
  }

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const frameDocument = iframe.contentDocument ?? iframe.contentWindow?.document;
  const frameWindow = iframe.contentWindow;
  if (!frameDocument || !frameWindow) {
    iframe.remove();
    return false;
  }

  frameDocument.open();
  frameDocument.write(printableHtml);
  frameDocument.close();

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    iframe.remove();
  };

  frameWindow.onafterprint = cleanup;
  setTimeout(cleanup, 6000);

  setTimeout(() => {
    try {
      frameWindow.focus();
      frameWindow.print();
    } catch {
      cleanup();
    }
  }, 120);

  return true;
}

export default function BillingPage() {
  const { encountersByNewest } = useEncounterNotes();
  const { officeSettings } = useOfficeSettings();
  const { contacts } = useContactDirectory();
  const {
    getRecord: getPatientBillingRecord,
    setCoreFields: setPatientBillingCoreFields,
    addAdjustment: addPatientBillingAdjustment,
    updateAdjustment: updatePatientBillingAdjustment,
    removeAdjustment: removePatientBillingAdjustment,
  } = usePatientBilling();

  const [patientSearch, setPatientSearch] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [message, setMessage] = useState("");
  const [adjustmentLabelDraft, setAdjustmentLabelDraft] = useState("");
  const [adjustmentAmountDraft, setAdjustmentAmountDraft] = useState("");

  const diagnosisMap = useMemo(() => loadPatientDiagnosesMap(), []);

  const patientsById = useMemo(() => {
    const map = new Map<string, BillingPatient>();
    seedPatients.forEach((entry) => {
      map.set(entry.id, {
        id: entry.id,
        fullName: entry.fullName,
        phone: entry.phone,
        dob: toUsDate(entry.dob),
        dateOfLoss: toUsDate(entry.dateOfLoss),
        attorney: entry.attorney,
      });
    });
    encountersByNewest.forEach((entry) => {
      if (!map.has(entry.patientId)) {
        map.set(entry.patientId, {
          id: entry.patientId,
          fullName: entry.patientName,
          phone: "",
          dob: "",
          dateOfLoss: "",
          attorney: "",
        });
      }
    });
    return map;
  }, [encountersByNewest]);

  const chargeTotalsByPatientId = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    encountersByNewest.forEach((entry) => {
      const current = map.get(entry.patientId) ?? { count: 0, total: 0 };
      entry.charges.forEach((charge) => {
        current.count += 1;
        current.total += charge.unitPrice * charge.units;
      });
      map.set(entry.patientId, current);
    });
    return map;
  }, [encountersByNewest]);

  const patientRows = useMemo(() => {
    return Array.from(patientsById.values())
      .map((entry) => {
        const totals = chargeTotalsByPatientId.get(entry.id) ?? { count: 0, total: 0 };
        const caseNumber = buildCaseNumber(entry.dateOfLoss, entry.fullName);
        return {
          ...entry,
          caseNumber,
          chargeCount: totals.count,
          chargeTotal: totals.total,
        } satisfies BillingPatientRow;
      })
      .sort((left, right) => left.fullName.localeCompare(right.fullName));
  }, [patientsById, chargeTotalsByPatientId]);

  const filteredPatients = useMemo(() => {
    const query = patientSearch.trim().toLowerCase();
    if (!query) {
      return patientRows;
    }
    return patientRows.filter((entry) => {
      return (
        entry.fullName.toLowerCase().includes(query) ||
        entry.phone.toLowerCase().includes(query) ||
        entry.attorney.toLowerCase().includes(query) ||
        entry.dateOfLoss.toLowerCase().includes(query) ||
        entry.caseNumber.toLowerCase().includes(query)
      );
    });
  }, [patientRows, patientSearch]);

  const fallbackPatientId = filteredPatients.find((entry) => entry.chargeCount > 0)?.id ?? filteredPatients[0]?.id ?? "";
  const activePatientId = selectedPatientId || fallbackPatientId;
  const selectedPatient = patientRows.find((entry) => entry.id === activePatientId) ?? null;

  const encounterChargeLines = useMemo(() => {
    if (!activePatientId) {
      return [] as EncounterChargeLine[];
    }
    return encountersByNewest
      .filter((encounter) => encounter.patientId === activePatientId)
      .flatMap((encounter) =>
        encounter.charges.map((charge) => ({
          id: `${encounter.id}-${charge.id}`,
          encounterDate: toUsDate(encounter.encounterDate),
          provider: encounter.provider,
          appointmentType: encounter.appointmentType,
          procedureCode: charge.procedureCode,
          description: charge.name,
          units: charge.units,
          unitPrice: charge.unitPrice,
          lineTotal: charge.unitPrice * charge.units,
        })),
      )
      .sort((left, right) => toSortStamp(left.encounterDate) - toSortStamp(right.encounterDate));
  }, [activePatientId, encountersByNewest]);

  const totalBilled = useMemo(
    () => encounterChargeLines.reduce((sum, entry) => sum + entry.lineTotal, 0),
    [encounterChargeLines],
  );
  const patientBillingRecord = activePatientId ? getPatientBillingRecord(activePatientId) : null;
  const billedAmount = patientBillingRecord ? patientBillingRecord.billedAmount : totalBilled;
  const paidAmount = patientBillingRecord?.paidAmount ?? 0;
  const paidDate = patientBillingRecord?.paidDate ?? "";
  const settlementAdjustments = patientBillingRecord?.adjustments ?? [];
  const totalAdjustments = useMemo(
    () => settlementAdjustments.reduce((sum, entry) => sum + entry.amount, 0),
    [settlementAdjustments],
  );
  const remainingBalance = billedAmount - paidAmount - totalAdjustments;

  const diagnoses = useMemo(() => {
    if (!activePatientId) {
      return [] as PatientDiagnosisEntry[];
    }
    return diagnosisMap[activePatientId] ?? [];
  }, [activePatientId, diagnosisMap]);

  const attorneyContact = useMemo(() => {
    if (!selectedPatient?.attorney.trim()) {
      return null;
    }
    return (
      contacts.find(
        (entry) =>
          normalizeLookupValue(entry.category) === "attorney" &&
          normalizeLookupValue(entry.name) === normalizeLookupValue(selectedPatient.attorney),
      ) ?? null
    );
  }, [contacts, selectedPatient]);

  const providerName = encounterChargeLines[0]?.provider ?? officeSettings.doctorName;

  const handleSetBilledAmount = (value: string) => {
    if (!activePatientId) {
      return;
    }
    const parsed = Number.parseFloat(value);
    setPatientBillingCoreFields(activePatientId, {
      billedAmount: Number.isFinite(parsed) ? parsed : 0,
    });
  };

  const handleSetPaidAmount = (value: string) => {
    if (!activePatientId) {
      return;
    }
    const parsed = Number.parseFloat(value);
    setPatientBillingCoreFields(activePatientId, {
      paidAmount: Number.isFinite(parsed) ? parsed : 0,
    });
  };

  const handleSetPaidDate = (value: string) => {
    if (!activePatientId) {
      return;
    }
    setPatientBillingCoreFields(activePatientId, {
      paidDate: formatUsDateInput(value),
    });
  };

  const handleAddAdjustment = () => {
    if (!activePatientId) {
      setMessage("Select a patient first.");
      return;
    }
    const normalizedLabel = adjustmentLabelDraft.trim();
    const parsedAmount = Number.parseFloat(adjustmentAmountDraft);
    if (!normalizedLabel || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setMessage("Enter an adjustment name and amount.");
      return;
    }
    const added = addPatientBillingAdjustment(activePatientId, {
      label: normalizedLabel,
      amount: parsedAmount,
    });
    if (!added) {
      setMessage("Could not add adjustment.");
      return;
    }
    setAdjustmentLabelDraft("");
    setAdjustmentAmountDraft("");
    setMessage("Adjustment added.");
  };

  const handleApplyBalanceAdjustment = () => {
    if (!activePatientId) {
      setMessage("Select a patient first.");
      return;
    }
    if (remainingBalance <= 0) {
      setMessage("No remaining balance to adjust.");
      return;
    }
    addPatientBillingAdjustment(activePatientId, {
      label: "Settlement Discount",
      amount: Math.round(remainingBalance * 100) / 100,
    });
    setMessage("Settlement discount added to zero out balance.");
  };

  const handlePrintBill = () => {
    if (!selectedPatient) {
      setMessage("Select a patient first.");
      return;
    }
    if (!encounterChargeLines.length) {
      setMessage("This patient has no encounter charges.");
      return;
    }

    const printableHtml = buildPrintHtml({
      officeName: officeSettings.officeName,
      officeAddress: officeSettings.address,
      officePhone: officeSettings.phone,
      officeFax: officeSettings.fax,
      officeEmail: officeSettings.email,
      logoDataUrl: officeSettings.logoDataUrl,
      patientName: selectedPatient.fullName,
      patientPhone: selectedPatient.phone,
      patientDob: selectedPatient.dob,
      patientDoi: selectedPatient.dateOfLoss,
      caseNumber: buildCaseNumber(selectedPatient.dateOfLoss, selectedPatient.fullName),
      attorneyName: selectedPatient.attorney,
      attorneyPhone: attorneyContact?.phone ?? "",
      providerName,
      statementDate: new Date().toLocaleDateString("en-US"),
      diagnoses,
      rows: encounterChargeLines,
      total: billedAmount,
      totalPaid: paidAmount,
      totalAdjustments,
      remainingBalance,
      settlementAdjustments: settlementAdjustments.map((entry) => ({
        id: entry.id,
        label: entry.label,
        amount: entry.amount,
      })),
    });

    const opened = printHtmlWithIframeFallback(printableHtml);
    if (!opened) {
      setMessage("Could not open print view. Check popup/browser settings and try again.");
      return;
    }
    setMessage("Statement opened. Use Print -> Save as PDF.");
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <section className="panel-card p-4">
        <h2 className="text-xl font-semibold">Patients</h2>
        <input
          className="mt-3 w-full rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
          onChange={(event) => setPatientSearch(event.target.value)}
          placeholder="Search patient..."
          value={patientSearch}
        />
        <div className="mt-3 max-h-[72vh] space-y-2 overflow-auto pr-1">
          {filteredPatients.map((entry) => {
            const selected = entry.id === activePatientId;
            return (
              <button
                className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                  selected
                    ? "border-[var(--brand-primary)] bg-[var(--bg-soft)]"
                    : "border-[var(--line-soft)] bg-white hover:bg-[var(--bg-soft)]"
                }`}
                key={entry.id}
                onClick={() => {
                  setSelectedPatientId(entry.id);
                  setMessage("");
                }}
                type="button"
              >
                <p className="font-semibold">{entry.fullName}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  Case #: {entry.caseNumber || "-"} • DOI: {entry.dateOfLoss || "-"}
                </p>
              </button>
            );
          })}
          {filteredPatients.length === 0 && (
            <p className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-4 text-sm text-[var(--text-muted)]">
              No matching patients.
            </p>
          )}
        </div>
      </section>

      <div className="space-y-4">
        <section className="panel-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Patient Billing Statement</h2>
              <p className="text-sm text-[var(--text-muted)]">
                {selectedPatient ? selectedPatient.fullName : "Select a patient"}
              </p>
            </div>
            <button
              className="rounded-xl bg-[var(--brand-primary)] px-4 py-2 font-semibold text-white disabled:opacity-50"
              disabled={!selectedPatient || encounterChargeLines.length === 0}
              onClick={handlePrintBill}
              type="button"
            >
              Print Bill
            </button>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--bg-soft)] p-3">
              <p className="text-xs text-[var(--text-muted)]">Case #</p>
              <p className="font-semibold">
                {selectedPatient ? buildCaseNumber(selectedPatient.dateOfLoss, selectedPatient.fullName) || "-" : "-"}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--bg-soft)] p-3">
              <p className="text-xs text-[var(--text-muted)]">DOB</p>
              <p className="font-semibold">{selectedPatient?.dob || "-"}</p>
            </div>
            <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--bg-soft)] p-3">
              <p className="text-xs text-[var(--text-muted)]">Date of Injury</p>
              <p className="font-semibold">{selectedPatient?.dateOfLoss || "-"}</p>
            </div>
            <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--bg-soft)] p-3">
              <p className="text-xs text-[var(--text-muted)]">Total Billed</p>
              <p className="font-semibold">{formatMoney(billedAmount)}</p>
            </div>
            <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--bg-soft)] p-3">
              <p className="text-xs text-[var(--text-muted)]">Paid</p>
              <p className="font-semibold">{formatMoney(paidAmount)}</p>
            </div>
            <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--bg-soft)] p-3">
              <p className="text-xs text-[var(--text-muted)]">Balance</p>
              <p className={`font-semibold ${remainingBalance <= 0 ? "text-[#196d3a]" : "text-[#b43b34]"}`}>
                {formatMoney(remainingBalance)}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-soft)] p-3">
            <h3 className="text-lg font-semibold">Close-Out Settlement</h3>
            <p className="text-sm text-[var(--text-muted)]">
              Track billed amount, attorney payment, and named adjustments (negotiation, patient discount, etc.).
            </p>

            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <label className="grid gap-1">
                <span className="text-sm font-semibold text-[var(--text-muted)]">Billed Amount</span>
                <input
                  className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                  onChange={(event) => handleSetBilledAmount(event.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  type="number"
                  value={Number.isFinite(billedAmount) ? billedAmount : 0}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-semibold text-[var(--text-muted)]">Paid Amount</span>
                <input
                  className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                  onChange={(event) => handleSetPaidAmount(event.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  type="number"
                  value={Number.isFinite(paidAmount) ? paidAmount : 0}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-semibold text-[var(--text-muted)]">Paid Date</span>
                <input
                  className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                  inputMode="numeric"
                  maxLength={10}
                  onChange={(event) => handleSetPaidDate(event.target.value)}
                  placeholder="MM/DD/YYYY"
                  value={paidDate}
                />
              </label>
            </div>

            <div className="mt-3 rounded-xl border border-[var(--line-soft)] bg-white p-3">
              <h4 className="text-base font-semibold">Adjustments / Discounts</h4>
              <div className="mt-2 grid gap-2 md:grid-cols-[minmax(0,1fr)_160px_auto_auto] md:items-end">
                <label className="grid gap-1">
                  <span className="text-xs font-semibold text-[var(--text-muted)]">Name</span>
                  <input
                    className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                    onChange={(event) => setAdjustmentLabelDraft(event.target.value)}
                    placeholder="Negotiation Discount"
                    value={adjustmentLabelDraft}
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-semibold text-[var(--text-muted)]">Amount</span>
                  <input
                    className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                    onChange={(event) => setAdjustmentAmountDraft(event.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    type="number"
                    value={adjustmentAmountDraft}
                  />
                </label>
                <button
                  className="rounded-xl border border-[var(--line-soft)] bg-white px-4 py-2 font-semibold"
                  onClick={handleAddAdjustment}
                  type="button"
                >
                  Add Adjustment
                </button>
                <button
                  className="rounded-xl border border-[var(--line-soft)] bg-white px-4 py-2 font-semibold"
                  onClick={handleApplyBalanceAdjustment}
                  type="button"
                >
                  Zero-Out Balance
                </button>
              </div>

              <div className="mt-3 space-y-2">
                {settlementAdjustments.map((entry) => (
                  <div
                    className="grid gap-2 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-soft)] p-2 md:grid-cols-[minmax(0,1fr)_140px_110px]"
                    key={entry.id}
                  >
                    <input
                      className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                      onChange={(event) =>
                        activePatientId
                          ? updatePatientBillingAdjustment(activePatientId, entry.id, {
                              label: event.target.value,
                            })
                          : null
                      }
                      value={entry.label}
                    />
                    <input
                      className="rounded-xl border border-[var(--line-soft)] bg-white px-3 py-2"
                      onChange={(event) =>
                        activePatientId
                          ? updatePatientBillingAdjustment(activePatientId, entry.id, {
                              amount: Number.parseFloat(event.target.value) || 0,
                            })
                          : null
                      }
                      step="0.01"
                      type="number"
                      value={entry.amount}
                    />
                    <button
                      className="rounded-xl border border-[var(--line-soft)] bg-white px-4 py-2 font-semibold"
                      onClick={() => {
                        if (!activePatientId) {
                          return;
                        }
                        removePatientBillingAdjustment(activePatientId, entry.id);
                      }}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {settlementAdjustments.length === 0 && (
                  <p className="text-sm text-[var(--text-muted)]">No adjustments yet.</p>
                )}
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <p className="text-sm">
                  <span className="font-semibold">Paid:</span> {formatMoney(paidAmount)}
                </p>
                <p className="text-sm">
                  <span className="font-semibold">Adjustments:</span> {formatMoney(totalAdjustments)}
                </p>
                <p className="text-sm">
                  <span className="font-semibold">Balance:</span>{" "}
                  <span className={remainingBalance <= 0 ? "text-[#196d3a] font-semibold" : "text-[#b43b34] font-semibold"}>
                    {formatMoney(remainingBalance)}
                  </span>
                </p>
              </div>
            </div>
          </div>

          {message && <p className="mt-3 text-sm font-semibold text-[var(--brand-primary)]">{message}</p>}
        </section>

        <section className="panel-card overflow-hidden">
          <div className="border-b border-[var(--line-soft)] p-4">
            <h3 className="text-lg font-semibold">Diagnoses</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="bg-[var(--bg-soft)] text-left text-sm">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Description</th>
                </tr>
              </thead>
              <tbody>
                {diagnoses.map((entry, index) => (
                  <tr className="border-t border-[var(--line-soft)]" key={entry.id}>
                    <td className="px-4 py-3">{index + 1}</td>
                    <td className="px-4 py-3">{entry.code}</td>
                    <td className="px-4 py-3">{entry.description}</td>
                  </tr>
                ))}
                {diagnoses.length === 0 && (
                  <tr>
                    <td className="px-4 py-4 text-sm text-[var(--text-muted)]" colSpan={3}>
                      No diagnosis codes on file for this patient.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel-card overflow-hidden">
          <div className="border-b border-[var(--line-soft)] p-4">
            <h3 className="text-lg font-semibold">Procedures</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="bg-[var(--bg-soft)] text-left text-sm">
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Service</th>
                  <th className="px-4 py-3">POS</th>
                  <th className="px-4 py-3">Un</th>
                  <th className="px-4 py-3">Charge</th>
                  <th className="px-4 py-3">Tax</th>
                </tr>
              </thead>
              <tbody>
                {encounterChargeLines.map((line, index) => (
                  <tr className="border-t border-[var(--line-soft)]" key={line.id}>
                    <td className="px-4 py-3">{index + 1}</td>
                    <td className="px-4 py-3">{line.encounterDate}</td>
                    <td className="px-4 py-3">
                      {line.procedureCode} - {line.description}
                    </td>
                    <td className="px-4 py-3">11</td>
                    <td className="px-4 py-3">{line.units}</td>
                    <td className="px-4 py-3">{formatMoney(line.lineTotal)}</td>
                    <td className="px-4 py-3">{formatMoney(0)}</td>
                  </tr>
                ))}
                {encounterChargeLines.length === 0 && (
                  <tr>
                    <td className="px-4 py-4 text-sm text-[var(--text-muted)]" colSpan={7}>
                      No encounter charges found for this patient.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
