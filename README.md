# Aling Nena POS — Android starter

Configured for Aling Nena, PHP (₱), one owner/administrator, and up to 2,000 products.

## Features
- POS cart, checkout, receipt printing/share via Android print dialog
- Product inventory with SKU, barcode/QR value, category, cost, selling price, and stock
- Camera scanning for common barcode formats and QR
- Automatic stock deduction at checkout and stock restoration on full-sale refund
- Daily and selectable-month sales totals, estimated gross profit, and transaction history
- Full-sale refund controls with duplicate-refund prevention
- Cash-in / cash-out records with monthly totals
- CSV product import and product export
- CSV sales report export
- JSON backup and restore
- Editable store name and locally persisted data

## Run on Android
1. Install Node.js LTS. Install Android Studio, or use an Android phone with Expo Go.
2. Extract this ZIP and open a terminal in the project folder.
3. Run `npm install`.
4. Run `npx expo start`.
5. Scan the Expo QR code using Expo Go on Android.

For a standalone APK/AAB, configure EAS Build (`npx eas build:configure`, then `npx eas build --platform android`). This project is source code, not a signed APK.

## CSV import format
The first row must contain these column names:
`name,sku,barcode,category,price,cost,stock`

Rows with a name, numeric price, and non-negative whole-number stock are imported. Existing products with matching barcode or SKU are updated.

## Important limitations before commercial use
- All data is local to this device; there is no cloud sync or multi-device backup.
- Full-sale refunds are recorded locally and restore the sold quantities; no payment processor is automatically refunded.
- Receipt output uses the Android print/share services; a compatible printer and print service may be needed.
- CSV import is for comma-separated text files, not native XLS/XLSX workbooks.
- Have the app tested on your target Android devices and implement secure off-device backup, audit logs, tax rules, and accounting review before relying on it for business operations.
