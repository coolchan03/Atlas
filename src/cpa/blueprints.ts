/**
 * Starting outlines for the four exams, as topics to tick off. They are written from general knowledge of how the exams are
 * organised, NOT copied from the AICPA, and they will drift as the exams change. Compare them with the current AICPA blueprint
 * for your exam date and edit them: add, remove, rename, or paste the blueprint's own outline to replace them.
 */
export type ExamCode = 'REG' | 'TCP' | 'FAR' | 'AUD';
export interface ExamInfo { code: ExamCode; name: string; short: string; areas: Array<{ area: string; topics: string[] }> }

export const EXAMS: ExamInfo[] = [
  { code: 'FAR', name: 'Financial Accounting and Reporting', short: 'FAR', areas: [
    { area: 'Conceptual framework and financial statements', topics: ['Conceptual framework and standard setting', 'Balance sheet and income statement', 'Comprehensive income and equity statement', 'Statement of cash flows', 'Notes and disclosures', 'Consolidated financial statements'] },
    { area: 'Select financial statement accounts', topics: ['Cash and receivables', 'Inventory', 'Property, plant and equipment', 'Intangible assets and goodwill', 'Investments in debt and equity securities', 'Payables, accruals and contingencies', 'Long-term debt', 'Equity and share-based payments'] },
    { area: 'Select transactions', topics: ['Revenue recognition', 'Leases', 'Income taxes', 'Earnings per share', 'Business combinations', 'Derivatives and hedging', 'Foreign currency', 'Accounting changes and error corrections', 'Subsequent events'] },
    { area: 'State and local governments', topics: ['Government-wide and fund financial statements', 'Governmental funds', 'Proprietary and fiduciary funds', 'Not-for-profit organizations'] },
  ] },
  { code: 'AUD', name: 'Auditing and Attestation', short: 'AUD', areas: [
    { area: 'Ethics, professional responsibilities and general principles', topics: ['Code of Professional Conduct and independence', 'Quality management', 'Engagement acceptance and agreements', 'Professional skepticism and judgment'] },
    { area: 'Assessing risk and planning', topics: ['Planning and materiality', 'Understanding the entity and its environment', 'Internal control and the control environment', 'Fraud risk', 'Risk of material misstatement', 'Information technology and controls'] },
    { area: 'Further procedures and evidence', topics: ['Audit evidence and documentation', 'Audit sampling', 'Analytical procedures', 'Tests of controls', 'Substantive procedures for specific accounts', 'Accounting estimates and related parties', 'Group audits and using the work of others'] },
    { area: 'Conclusions and reporting', topics: ['Subsequent events and going concern', 'Written representations', 'Forming the audit opinion', 'Modified opinions and emphasis paragraphs', 'Reviews, compilations and other engagements', 'Attestation engagements', 'Governmental auditing'] },
  ] },
  { code: 'REG', name: 'Taxation and Regulation', short: 'REG', areas: [
    { area: 'Ethics and federal tax procedures', topics: ['Circular 230 and preparer rules', 'Preparer penalties', 'IRS examinations, appeals and collections', 'Statute of limitations', 'Authority and research'] },
    { area: 'Business law', topics: ['Contracts', 'Agency', 'Debtor-creditor relationships and bankruptcy', 'Business structures and liability', 'Securities and consumer law basics'] },
    { area: 'Federal taxation of property transactions', topics: ['Basis', 'Capital gains and losses', 'Section 1231 and recapture', 'Like-kind exchanges', 'Installment sales', 'Depreciation and Section 179'] },
    { area: 'Federal taxation of individuals', topics: ['Filing status and exemptions', 'Gross income inclusions and exclusions', 'Adjustments to income', 'Itemized and standard deductions', 'Credits', 'Alternative minimum tax', 'Retirement plans', 'Passive activity rules', 'Self-employment tax', 'Estate and gift tax'] },
    { area: 'Federal taxation of entities', topics: ['C corporations', 'S corporations', 'Partnerships and LLCs', 'Consolidated returns', 'Tax-exempt organizations', 'Trusts and estates'] },
  ] },
  { code: 'TCP', name: 'Tax Compliance and Planning', short: 'TCP', areas: [
    { area: 'Individual tax compliance and planning', topics: ['Gross income and adjustments', 'Deductions and credits', 'Retirement and benefit planning', 'Passive activities and basis limits', 'Estimated tax and withholding'] },
    { area: 'Entity tax compliance', topics: ['C corporation returns', 'S corporation returns and shareholder basis', 'Partnership returns and basis', 'Consolidated and multistate issues', 'Estimated taxes and extensions'] },
    { area: 'Entity and owner tax planning', topics: ['Choice of entity', 'Distributions and redemptions', 'Reorganizations and liquidations', 'Compensation planning', 'Succession and ownership changes'] },
    { area: 'Property, estates, trusts and gifts', topics: ['Property transactions and character of gain', 'Like-kind and installment planning', 'Estate and gift tax planning', 'Trust and estate income tax', 'Charitable giving'] },
    { area: 'Multi-jurisdictional and ethics', topics: ['State and local tax', 'International tax basics', 'Ethics and practice before the IRS'] },
  ] },
];

export const examInfo = (code: ExamCode): ExamInfo => EXAMS.find((e) => e.code === code)!;
