import { pdfFilename } from "./format";
import type { Invoice } from "./types";

const A4_MM = { width: 210, height: 297 };

export async function downloadInvoicePdf(
  element: HTMLElement,
  invoice: Invoice,
): Promise<void> {
  const html2canvas = (await import("html2canvas")).default;
  const { jsPDF } = await import("jspdf");

  const host = document.createElement("div");
  host.setAttribute("data-pdf-host", "true");
  host.style.cssText =
    "position:fixed;left:0;top:0;z-index:-1;width:794px;background:#fff;pointer-events:none;";
  const clone = element.cloneNode(true) as HTMLElement;
  clone.style.transform = "none";
  clone.style.position = "static";
  host.appendChild(clone);
  document.body.appendChild(host);

  try {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    const canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
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
  } finally {
    host.remove();
  }
}
