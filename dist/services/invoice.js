import { jsPDF } from 'jspdf';
export async function generateInvoicePDF(appointment) {
    const doc = new jsPDF();
    const primaryBlue = [52, 185, 227]; // #34B9E3
    const darkGrey = [51, 51, 51];
    const lightGrey = [245, 245, 245];
    // --- HEADER ---
    // Blue decorative circle-like element (mocked with an arc/circle)
    doc.setFillColor(230, 247, 255);
    doc.circle(30, 25, 40, 'F');
    // "INVOICE" Title
    doc.setTextColor(darkGrey[0], darkGrey[1], darkGrey[2]);
    doc.setFontSize(40);
    doc.setFont("helvetica", "bold");
    doc.text("INVOICE", 20, 35);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`INVOICE NO: ${appointment.appointmentId}`, 20, 45);
    doc.text(`DATE: ${appointment.date}`, 20, 50);
    // Clinic Info (Top Right)
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
    doc.text("BRIGHTCARE DENTAL", 190, 25, { align: "right" });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text("Clinic Main Road, City Center", 190, 32, { align: "right" });
    doc.text("+91 98765-43210", 190, 37, { align: "right" });
    doc.text("www.brightcaredental.com", 190, 42, { align: "right" });
    // --- BILLED TO ---
    let y = 70;
    doc.setFillColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
    doc.rect(20, y, 170, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("BILLED TO", 25, y + 5.5);
    y += 15;
    doc.setTextColor(darkGrey[0], darkGrey[1], darkGrey[2]);
    doc.setFont("helvetica", "bold");
    doc.text("Patient Name:", 20, y);
    doc.setFont("helvetica", "normal");
    doc.text(appointment.patientName, 50, y);
    y += 7;
    doc.setFont("helvetica", "bold");
    doc.text("Phone No:", 20, y);
    doc.setFont("helvetica", "normal");
    doc.text(appointment.phone, 50, y);
    y += 7;
    doc.setFont("helvetica", "bold");
    doc.text("Age / Gender:", 20, y);
    doc.setFont("helvetica", "normal");
    doc.text(`${appointment.age} / ${appointment.gender}`, 50, y);
    // --- SERVICE DETAILS TABLE ---
    y += 15;
    // Table Header
    doc.setFillColor(240, 240, 240);
    doc.rect(20, y, 170, 10, 'F');
    doc.setFont("helvetica", "bold");
    doc.text("NO.", 25, y + 7);
    doc.text("SERVICE DESCRIPTION", 45, y + 7);
    doc.text("QTY", 130, y + 7);
    doc.text("PRICE", 150, y + 7);
    doc.text("AMOUNT", 175, y + 7);
    // Table Content
    y += 10;
    doc.setFont("helvetica", "normal");
    doc.line(20, y, 190, y);
    y += 10;
    doc.text("1", 25, y);
    doc.text(`Consultation - ${appointment.doctorName} (${appointment.slot})`, 45, y);
    doc.text("1", 130, y);
    doc.text("₹100.00", 150, y);
    doc.text("₹100.00", 175, y);
    y += 5;
    doc.setDrawColor(230, 230, 230);
    doc.line(20, y, 190, y);
    // --- SUMMARY ---
    y += 20;
    const summaryX = 140;
    doc.setFont("helvetica", "normal");
    doc.text("Subtotal:", summaryX, y);
    doc.text("₹100.00", 190, y, { align: "right" });
    y += 7;
    doc.text("Tax (0%):", summaryX, y);
    doc.text("₹0.00", 190, y, { align: "right" });
    y += 10;
    doc.setFillColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
    doc.rect(summaryX - 5, y - 6, 55, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL AMOUNT:", summaryX, y);
    doc.text("₹100.00", 190, y, { align: "right" });
    // --- FOOTER ---
    y = 240;
    doc.setTextColor(darkGrey[0], darkGrey[1], darkGrey[2]);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Notes:", 20, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Please arrive 10 minutes before your slot.", 20, y + 5);
    doc.text(`Payment Mode: ${appointment.paymentMode === 'Online' ? 'Online (UPI)' : 'Direct at Clinic'}`, 20, y + 10);
    doc.text(`Status: ${appointment.paymentStatus}`, 20, y + 15);
    // Signature
    doc.line(140, y + 15, 190, y + 15);
    doc.text("Authorized Signature", 165, y + 20, { align: "center" });
    // Bottom Bar
    doc.setFillColor(primaryBlue[0], primaryBlue[1], primaryBlue[2]);
    doc.rect(0, 285, 210, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text("Thank you for choosing BrightCare Dental!", 105, 293, { align: "center" });
    // Output as Buffer
    const arrayBuffer = doc.output('arraybuffer');
    return Buffer.from(arrayBuffer);
}
//# sourceMappingURL=invoice.js.map