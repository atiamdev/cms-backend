const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function checkFields() {
  try {
    const templatePath = path.join(__dirname, '../cms-frontend/public/atiam-cert.pdf');
    const templateBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(templateBytes);
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    
    console.log(`Found ${fields.length} form fields:`);
    fields.forEach(field => {
      const type = field.constructor.name;
      const name = field.getName();
      console.log(`- ${name} (${type})`);
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkFields();
