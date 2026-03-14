/**
 * PDF Generator utility for creating sponsor invoices
 * Uses browser's built-in print functionality to generate PDFs
 */

import { loadInvoiceSettings, formatInvoiceNumber } from './invoiceSettings';

export const generateSponsorInvoice = (sponsor) => {
  // Load current settings
  const settings = loadInvoiceSettings();
  
  // Create a new window for printing
  const printWindow = window.open('', '_blank');
  
  if (!printWindow) {
    alert('Please allow pop-ups to generate invoices');
    return;
  }

  // Get current date
  const today = new Date();
  const invoiceDate = today.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  // Generate invoice number using settings
  const invoiceNumber = formatInvoiceNumber(settings, settings.invoice.nextNumber, sponsor.id);

  // Calculate totals
  const subtotal = sponsor.total_amount || 0;
  
  // Build the HTML content
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Invoice - ${sponsor.company_name}</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 20px;
          color: #333;
        }
        .invoice-container {
          max-width: 800px;
          margin: 0 auto;
          background: white;
          padding: 30px;
          box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
          border-bottom: 2px solid #2563eb;
          padding-bottom: 20px;
        }
        .header h1 {
          color: #2563eb;
          margin: 0;
          font-size: 28px;
        }
        .header p {
          margin: 5px 0;
          color: #666;
        }
        .invoice-title {
          text-align: center;
          margin: 20px 0;
        }
        .invoice-title h2 {
          margin: 0;
          color: #2563eb;
          font-size: 24px;
        }
        .invoice-details {
          display: flex;
          justify-content: space-between;
          margin: 30px 0;
          padding: 20px;
          background: #f9fafb;
          border-radius: 8px;
        }
        .bill-to h3, .invoice-info h3 {
          margin: 0 0 10px 0;
          color: #2563eb;
        }
        .bill-to p {
          margin: 5px 0;
        }
        .invoice-info p {
          margin: 5px 0;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 30px 0;
        }
        th {
          background: #2563eb;
          color: white;
          padding: 12px;
          text-align: left;
        }
        td {
          padding: 12px;
          border-bottom: 1px solid #ddd;
        }
        .amount-cell {
          text-align: right;
        }
        .total-row {
          font-weight: bold;
          background: #f0f9ff;
        }
        .total-row td {
          border-bottom: 2px solid #2563eb;
        }
        .grand-total {
          font-size: 18px;
          color: #2563eb;
        }
        .payment-info {
          margin: 30px 0;
          padding: 20px;
          background: #f9fafb;
          border-radius: 8px;
          text-align: center;
        }
        .payment-info h3 {
          margin: 0 0 10px 0;
          color: #2563eb;
        }
        .payment-info p {
          margin: 5px 0;
        }
        .payment-notes {
          margin-top: 15px;
          padding-top: 15px;
          border-top: 1px dashed #ccc;
          font-size: 14px;
          color: #666;
          white-space: pre-line;
        }
        .venmo {
          font-size: 20px;
          font-weight: bold;
          color: #2563eb;
          margin: 10px 0;
        }
        .footer {
          margin-top: 40px;
          text-align: center;
          border-top: 1px solid #ddd;
          padding-top: 20px;
          color: #666;
        }
        .thank-you {
          font-size: 20px;
          color: #2563eb;
          margin: 20px 0;
          text-align: center;
        }
        @media print {
          body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          .invoice-container { box-shadow: none; }
        }
      </style>
    </head>
    <body>
      <div class="invoice-container">
        <!-- Header -->
        <div class="header">
          <h1>${settings.organization.name}</h1>
          <p>${settings.organization.address} • ${settings.organization.cityStateZip}</p>
          <p>${settings.organization.phone}</p>
        </div>

        <!-- Invoice Title -->
        <div class="invoice-title">
          <h2>INVOICE</h2>
        </div>

        <!-- Invoice Details -->
        <div class="invoice-details">
          <div class="bill-to">
            <h3>BILL TO:</h3>
            <p><strong>${sponsor.company_name}</strong></p>
            ${sponsor.contact_name ? `<p>Attn: ${sponsor.contact_name}</p>` : ''}
            ${sponsor.email ? `<p>${sponsor.email}</p>` : ''}
            ${sponsor.phone ? `<p>${sponsor.phone}</p>` : ''}
          </div>
          <div class="invoice-info">
            <h3>INVOICE #:</h3>
            <p><strong>${invoiceNumber}</strong></p>
            <h3>DATE:</h3>
            <p><strong>${invoiceDate}</strong></p>
          </div>
        </div>

        <!-- Details Table -->
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th class="amount-cell">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${(sponsor.locations || []).map(loc => `
              <tr>
                <td>${loc.field} - ${loc.location}</td>
                <td class="amount-cell">$${loc.price.toFixed(2)}</td>
              </tr>
            `).join('')}
            <tr class="total-row">
              <td><strong>SUB TOTAL</strong></td>
              <td class="amount-cell"><strong>$${subtotal.toFixed(2)}</strong></td>
            </tr>
            <tr class="total-row grand-total">
              <td><strong>TOTAL</strong></td>
              <td class="amount-cell"><strong>$${subtotal.toFixed(2)}</strong></td>
            </tr>
          </tbody>
        </table>

        <!-- Payment Information -->
        <div class="payment-info">
          <h3>Payment Information</h3>
          <p>Please make checks payable to:</p>
          <p><strong>${settings.payment.checkPayableTo}</strong> ${settings.payment.alternatePayableTo ? `or <strong>${settings.payment.alternatePayableTo}</strong>` : ''}</p>
          <p>${settings.organization.name} • ${settings.organization.address} • ${settings.organization.cityStateZip}</p>
          <p class="venmo">${settings.organization.venmo}</p>
          ${settings.payment.notes ? `<div class="payment-notes">${settings.payment.notes}</div>` : ''}
        </div>

        <!-- Thank You -->
        <div class="thank-you">
          ${settings.invoice.thankYouMessage}
        </div>

        <!-- Footer -->
        <div class="footer">
          <p>${settings.invoice.footer}</p>
          <p><strong>${settings.organization.name}</strong> • ${settings.organization.email}</p>
        </div>
      </div>

      <script>
        window.onload = function() {
          window.print();
          setTimeout(function() { window.close(); }, 1000);
        };
      </script>
    </body>
    </html>
  `;

  // Write to the new window
  printWindow.document.write(htmlContent);
  printWindow.document.close();
  
  // Increment invoice number in settings (happens in formatInvoiceNumber)
  loadInvoiceSettings(); // This will increment the number
};