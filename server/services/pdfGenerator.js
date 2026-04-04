const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.join(__dirname, '../../public/reports');
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

// Korean font paths (Windows system fonts)
const FONT_REGULAR = 'C:/Windows/Fonts/malgun.ttf';
const FONT_BOLD = 'C:/Windows/Fonts/malgunbd.ttf';

function getFont(bold = false) {
  const fontPath = bold ? FONT_BOLD : FONT_REGULAR;
  if (fs.existsSync(fontPath)) return fontPath;
  // fallback: try regular for bold too
  if (fs.existsSync(FONT_REGULAR)) return FONT_REGULAR;
  return bold ? 'Helvetica-Bold' : 'Helvetica';
}

function generateReport(taskTitle, workLogs) {
  const filename = `report_${Date.now()}.pdf`;
  const filepath = path.join(REPORTS_DIR, filename);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    const fontBold = getFont(true);
    const fontRegular = getFont(false);

    // 제목
    doc.fontSize(22).font(fontBold).fillColor('#1a1a3e')
      .text('업무 보고서', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(14).font(fontRegular).fillColor('#333333')
      .text(`주제: ${taskTitle}`, { align: 'center' });
    doc.fontSize(10).fillColor('#666666')
      .text(`생성일시: ${new Date().toLocaleString('ko-KR')}`, { align: 'center' });
    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(550, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(1);

    // 각 에이전트 작업 내용
    for (const log of workLogs) {
      doc.fontSize(13).font(fontBold).fillColor('#1a1a3e')
        .text(`[${log.role}] ${log.agentName}`);
      doc.moveDown(0.3);
      doc.fontSize(11).font(fontRegular).fillColor('#222222')
        .text(log.content, { width: 480, align: 'left' });
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(550, doc.y).strokeColor('#eeeeee').dash(3, { space: 3 }).stroke();
      doc.undash();
      doc.moveDown(0.5);
    }

    doc.end();
    stream.on('finish', () => resolve(`/reports/${filename}`));
    stream.on('error', reject);
  });
}

module.exports = { generateReport };
