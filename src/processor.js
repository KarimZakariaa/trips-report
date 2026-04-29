(function initProcessor(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory;
  } else {
    root.createTripsProcessor = factory;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createTripsProcessor(XLSX) {
  if (!XLSX) {
    throw new Error("XLSX library is required.");
  }

  const HEADERS = {
    trip: ["رقمالرحلة", "tripnumber", "flightnumber"],
    pilgrims: ["اجماليعددالحجاج", "totalpilgrims"],
    bags: ["اجماليعددالحقائب", "totalbags"],
  };

  function normalizeArabic(value) {
    return String(value ?? "")
      .normalize("NFKD")
      .replace(/[\u064B-\u065F\u0670]/g, "")
      .replace(/[إأآٱ]/g, "ا")
      .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
      .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
      .replace(/\s+/g, "")
      .trim()
      .toLowerCase();
  }

  function normalizeTripNumber(value) {
    if (value === null || value === undefined) return "";
    const text = String(value).replace(/\s+/g, " ").trim();
    return text;
  }

  function formatOutputTripNumber(value) {
    return String(value ?? "").replace(/-/g, "");
  }

  function toNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const normalized = String(value ?? "")
      .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
      .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
      .replace(/,/g, "")
      .trim();
    const match = normalized.match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : 0;
  }

  function parseSheetDate(sheetName) {
    const match = String(sheetName).trim().match(/(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\s*$/);
    if (!match) return null;

    const day = Number(match[1]);
    const month = Number(match[2]);
    let year = Number(match[3]);
    if (year < 100) year += 2000;

    const timestamp = Date.UTC(year, month - 1, day);
    const date = new Date(timestamp);
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null;
    }

    return {
      key: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      timestamp,
    };
  }

  function findHeader(row, aliases) {
    const normalizedAliases = aliases.map((alias) => normalizeArabic(alias));
    return row.findIndex((cell) => normalizedAliases.includes(normalizeArabic(cell)));
  }

  function findHeaderMap(rows) {
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] || [];
      const trip = findHeader(row, HEADERS.trip);
      const pilgrims = findHeader(row, HEADERS.pilgrims);
      const bags = findHeader(row, HEADERS.bags);

      if (trip >= 0 && pilgrims >= 0 && bags >= 0) {
        return { rowIndex, trip, pilgrims, bags };
      }
    }
    return null;
  }

  function parseWorkbook(workbook, sourceName = "") {
    const records = [];
    const warnings = [];

    workbook.SheetNames.forEach((sheetName) => {
      const date = parseSheetDate(sheetName);
      if (!date) {
        warnings.push(`${sourceName || "Workbook"}: skipped sheet "${sheetName}" because no trip date was found.`);
        return;
      }

      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
        raw: true,
      });
      const headerMap = findHeaderMap(rows);
      if (!headerMap) {
        warnings.push(`${sourceName || "Workbook"}: skipped sheet "${sheetName}" because required headers were not found.`);
        return;
      }

      for (let rowIndex = headerMap.rowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex] || [];
        const tripNumber = normalizeTripNumber(row[headerMap.trip]);
        const normalizedTrip = normalizeArabic(tripNumber);

        if (!tripNumber || normalizedTrip === "الاجماليالعام" || normalizedTrip === "رقمالرحلة") {
          continue;
        }

        const totalPilgrims = toNumber(row[headerMap.pilgrims]);
        const totalBags = toNumber(row[headerMap.bags]);
        if (totalPilgrims === 0 && totalBags === 0) continue;

        records.push({
          tripNumber,
          tripKey: tripNumber.toUpperCase(),
          tripDate: date.key,
          tripDateSort: date.timestamp,
          totalPilgrims,
          totalBags,
        });
      }
    });

    return { records, warnings };
  }

  function aggregateRecords(records) {
    const grouped = new Map();

    records.forEach((record) => {
      const key = `${record.tripDate}||${record.tripKey}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.totalPilgrims += record.totalPilgrims;
        existing.totalBags += record.totalBags;
      } else {
        grouped.set(key, { ...record });
      }
    });

    return Array.from(grouped.values()).sort((left, right) => {
      if (left.tripDateSort !== right.tripDateSort) return left.tripDateSort - right.tripDateSort;
      return left.tripNumber.localeCompare(right.tripNumber, undefined, { numeric: true, sensitivity: "base" });
    });
  }

  function toOutputRows(records) {
    return records.map((record) => ({
      "Trip Number": formatOutputTripNumber(record.tripNumber),
      "Trip Date": record.tripDate,
      "Total pilgrims": record.totalPilgrims,
      "Total Bags": record.totalBags,
    }));
  }

  async function readBrowserFiles(files) {
    const allRecords = [];
    const allWarnings = [];

    for (const file of files) {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const { records, warnings } = parseWorkbook(workbook, file.name);
      allRecords.push(...records);
      allWarnings.push(...warnings);
    }

    const records = aggregateRecords(allRecords);
    return {
      records,
      rows: toOutputRows(records),
      warnings: allWarnings,
      sourceRows: allRecords.length,
    };
  }

  function buildOutputWorkbook(rows) {
    const worksheet = XLSX.utils.json_to_sheet(rows, {
      header: ["Trip Number", "Trip Date", "Total pilgrims", "Total Bags"],
    });
    worksheet["!cols"] = [{ wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 14 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Combined Trips");
    return workbook;
  }

  return {
    aggregateRecords,
    buildOutputWorkbook,
    parseSheetDate,
    parseWorkbook,
    readBrowserFiles,
    toOutputRows,
  };
});
