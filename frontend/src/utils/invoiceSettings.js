// Default invoice settings
const DEFAULT_INVOICE_SETTINGS = {
  organization: {
    name: 'Sayreville Little League',
    abbreviation: 'SLL',
    address: 'P.O. Box 123',
    cityStateZip: 'Parlin, NJ 08859',
    phone: '732-727-4496',
    email: 'sayrevillelittleleagueinfo@gmail.com',
    venmo: '@SayrevilleLittleLeague'
  },
  payment: {
    checkPayableTo: 'Sayreville Little League',
    alternatePayableTo: 'SLL',
    notes: ''
  },
  invoice: {
    footer: 'If you have any questions concerning this invoice, please contact:',
    thankYouMessage: 'THANK YOU FOR YOUR BUSINESS!',
    prefix: 'INV',
    nextNumber: 1001
  }
};

// Load settings from localStorage
export const loadInvoiceSettings = () => {
  try {
    const saved = localStorage.getItem('invoice_settings');
    return saved ? JSON.parse(saved) : DEFAULT_INVOICE_SETTINGS;
  } catch (error) {
    console.error('Error loading invoice settings:', error);
    return DEFAULT_INVOICE_SETTINGS;
  }
};

// Save settings to localStorage
export const saveInvoiceSettings = (settings) => {
  try {
    localStorage.setItem('invoice_settings', JSON.stringify(settings));
    return true;
  } catch (error) {
    console.error('Error saving invoice settings:', error);
    return false;
  }
};

// Get next invoice number and increment
export const getNextInvoiceNumber = (settings) => {
  const number = settings.invoice.nextNumber;
  // Save the incremented number
  settings.invoice.nextNumber = number + 1;
  saveInvoiceSettings(settings);
  return number;
};

// Format invoice number with prefix and year
export const formatInvoiceNumber = (settings, number, sponsorId) => {
  const year = new Date().getFullYear();
  return `${settings.invoice.prefix}-${year}-${String(sponsorId).padStart(4, '0')}`;
};