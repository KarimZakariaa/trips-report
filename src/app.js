const processor = window.createTripsProcessor(window.XLSX);

const madinaInput = document.querySelector("#madina-file");
const jeddahInput = document.querySelector("#jeddah-file");
const generateButton = document.querySelector("#generate");
const downloadButton = document.querySelector("#download");
const resetButton = document.querySelector("#reset");
const statusNode = document.querySelector("#status");
const warningNode = document.querySelector("#warnings");
const tableBody = document.querySelector("#preview tbody");
const emptyPreview = document.querySelector("#empty-preview");
const summaryRows = document.querySelector("#summary-rows");
const summaryPilgrims = document.querySelector("#summary-pilgrims");
const summaryBags = document.querySelector("#summary-bags");

let outputRows = [];

function selectedFiles() {
  return [madinaInput.files[0], jeddahInput.files[0]].filter(Boolean);
}

function setStatus(message, type = "muted") {
  statusNode.textContent = message;
  statusNode.dataset.type = type;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function rowsByTripType(type) {
  return outputRows.filter((row) => row["M/S"] === type);
}

function renderWarnings(warnings) {
  warningNode.innerHTML = "";
  warnings.forEach((warning) => {
    const item = document.createElement("li");
    item.textContent = warning;
    warningNode.appendChild(item);
  });
}

function renderPreview(rows) {
  tableBody.innerHTML = "";

  rows.slice(0, 100).forEach((row) => {
    const tr = document.createElement("tr");
    ["Trip Number", "M/S", "Trip Date", "Total pilgrims", "Total Bags"].forEach((field) => {
      const td = document.createElement("td");
      td.textContent = field.includes("Total") ? formatNumber(row[field]) : row[field];
      tr.appendChild(td);
    });
    tableBody.appendChild(tr);
  });

  emptyPreview.hidden = rows.length > 0;
  summaryRows.textContent = formatNumber(rows.length);
  summaryPilgrims.textContent = formatNumber(rows.reduce((sum, row) => sum + row["Total pilgrims"], 0));
  summaryBags.textContent = formatNumber(rows.reduce((sum, row) => sum + row["Total Bags"], 0));
}

async function generateOutput() {
  const files = selectedFiles();
  if (files.length !== 2) {
    setStatus("Select both Madina and Jeddah Excel files.", "error");
    return;
  }

  generateButton.disabled = true;
  downloadButton.disabled = true;
  setStatus("Processing files...", "muted");
  renderWarnings([]);

  try {
    const result = await processor.readBrowserFiles(files);
    outputRows = result.rows;
    renderPreview(outputRows);
    renderWarnings(result.warnings);

    if (outputRows.length === 0) {
      setStatus("No trip rows were found.", "error");
      return;
    }

    downloadButton.disabled = false;
    setStatus(
      `Ready: ${formatNumber(rowsByTripType("M").length)} M rows, ${formatNumber(rowsByTripType("S").length)} S rows.`,
      "success"
    );
  } catch (error) {
    outputRows = [];
    renderPreview(outputRows);
    setStatus(error.message || "Could not process the selected files.", "error");
  } finally {
    generateButton.disabled = false;
  }
}

function downloadOutput() {
  if (outputRows.length === 0) return;

  [
    { type: "M", filename: "combined-trips-M.xlsx" },
    { type: "S", filename: "combined-trips-S.xlsx" },
  ].forEach(({ type, filename }) => {
    const rows = rowsByTripType(type);
    if (rows.length === 0) return;

    const workbook = processor.buildOutputWorkbook(rows, `${type} Trips`);
    window.XLSX.writeFile(workbook, filename);
  });
}

function resetPage() {
  madinaInput.value = "";
  jeddahInput.value = "";
  outputRows = [];
  renderPreview(outputRows);
  renderWarnings([]);
  downloadButton.disabled = true;
  setStatus("Waiting for files.", "muted");
}

generateButton.addEventListener("click", generateOutput);
downloadButton.addEventListener("click", downloadOutput);
resetButton.addEventListener("click", resetPage);

renderPreview([]);
