import { pdfFilename } from "./format";
import type { Invoice } from "./types";

const A4_MM = { width: 210, height: 297 };

export async function downloadInvoicePdf(
  element: HTMLElement,
  invoice: Invoice,
): Promise<void> {
  const html2canvas = (await import("html2canvas")).default;
  const { jsPDF } = await import("jspdf");

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
    onclone: (clonedDoc) => {
      const root = clonedDoc.querySelector(".invoice-paper") ?? clonedDoc.body;
      root.querySelectorAll("*").forEach((node) => {
        if (!(node instanceof HTMLElement) || !clonedDoc.defaultView) return;
        const style = clonedDoc.defaultView.getComputedStyle(node);
        node.style.color = style.color;
        node.style.backgroundColor = style.backgroundColor;
        node.style.borderColor = style.borderColor;
      });
    },
  });

  const pdf = new jsPDF({
    unit: "mm",
    format: "a4",
    orientation: "portrait",
  });

  const pageWidth = A4_MM.width;
  const pageHeight = A4_MM.height;
  const imgData = canvas.toDataURL("image/jpeg", 0.98);
  const imgHeight = (canvas.height * pageWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 0;

  pdf.addImage(imgData, "JPEG", 0, position, pageWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0.5) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, "JPEG", 0, position, pageWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  pdf.save(pdfFilename(invoice));
}
