import { RequestHandler } from "express";
import { Pool } from "../../config/connectDB";
import { TFaqLog } from "../models/FAQLog";

export const rateFaq: RequestHandler = async (req, res) => {
  const { faq_id, action } = req.body;

  if (!faq_id || !action) {
    res.status(400).json({ error: "faq_id와 action은 필수 값입니다." });
    return;
  }

  const adjustedRate = action === "like" ? 1 : action === "dislike" ? -1 : 0;

  try {
    const query = `
      INSERT INTO faq_logs (faq_id, rate)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE
        rate = rate + VALUES(rate)
    `;

    await Pool.query(query, [faq_id, adjustedRate]);

    res.json({ success: true, message: "FAQ 평가가 저장되었습니다." });
    return; 
  } catch (error: any) {
    console.error(error.message);
    res.status(500).json({ error: "FAQ 평가 저장에 실패했습니다." });
    return;
  }
}
