import { Document, model, Schema, Types } from "mongoose";

export type TFAQMetadata = {
	faqId: Types.ObjectId;
	userQuestion: string;
	searchDate: Date;
	feedbackScore: number;
};

export interface IFAQMetadata extends TFAQMetadata, Document { }

const faqMetadataSchema: Schema = new Schema({
	faqId: { type: Schema.Types.ObjectId, ref: "FAQ", required: true },
	userQuestion: { type: String, required: true },
	searchDate: { type: Date, required: true },
	feedbackScore: { type: Number, required: true },
});

const FAQMetadata = model<IFAQMetadata>("FAQMetadata", faqMetadataSchema);

export default FAQMetadata;
