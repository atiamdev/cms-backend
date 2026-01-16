const { PDFDocument } = require("pdf-lib");
const fs = require("fs");
const path = require("path");

async function checkFields() {
  try {
    // Load the template PDF.
    // Prefer a remote template URL provided via env (CERTIFICATE_TEMPLATE_URL) for deployments,
    // otherwise fall back to the local file under cms-frontend/public.
    const templateUrl = process.env.CERTIFICATE_TEMPLATE_URL;
    let templateBytes;

    if (templateUrl && /^https?:\/\//i.test(templateUrl)) {
      console.log(
        "Using remote certificate template URL from env:",
        templateUrl
      );

      // Use global fetch if available (Node 18+). Otherwise lazily require node-fetch.
      let fetchFn;
      if (typeof globalThis.fetch === "function") {
        fetchFn = globalThis.fetch.bind(globalThis);
      } else {
        try {
          // node-fetch v3 is ESM; require may work if installed as a cjs shim. Try to require.
          // eslint-disable-next-line global-require
          const nodeFetch = require("node-fetch");
          fetchFn = nodeFetch;
        } catch (err) {
          throw new Error(
            "fetch is not available in this Node version and 'node-fetch' is not installed. Install node-fetch or run on Node 18+."
          );
        }
      }

      const resp = await fetchFn(templateUrl);
      if (!resp.ok) {
        throw new Error(
          `Failed to download remote certificate template: ${resp.status} ${resp.statusText}`
        );
      }

      const arrayBuffer = await resp.arrayBuffer();
      templateBytes = Buffer.from(arrayBuffer);
      console.log(
        "Remote certificate template downloaded, size:",
        templateBytes.length,
        "bytes"
      );
    } else {
      const templatePath = path.join(
        __dirname,
        "../cms-frontend/public/atiam-cert.pdf"
      );

      console.log("Using local certificate template path:", templatePath);
      if (!fs.existsSync(templatePath)) {
        throw new Error(
          `Certificate template not found at: ${templatePath}. Please ensure atiam-cert.pdf exists in cms-frontend/public/ or set CERTIFICATE_TEMPLATE_URL env var`
        );
      }

      templateBytes = fs.readFileSync(templatePath);
      console.log(
        "Local certificate template loaded, size:",
        templateBytes.length,
        "bytes"
      );
    }

    const pdfDoc = await PDFDocument.load(templateBytes);
    const form = pdfDoc.getForm();
    const fields = form.getFields();

    console.log(`Found ${fields.length} form fields:`);
    fields.forEach((field) => {
      const type = field.constructor.name;
      const name = field.getName();
      console.log(`- ${name} (${type})`);
    });
  } catch (error) {
    console.error("Error:", error.message);
  }
}

checkFields();
