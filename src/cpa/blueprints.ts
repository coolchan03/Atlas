/**
 * Starting outlines for the four exams, as topics to tick off. They are written from general knowledge of how the exams are
 * organised, NOT copied from the AICPA, and they will drift as the exams change. Compare them with the current AICPA blueprint
 * for your exam date and edit them: add, remove, rename, or paste the blueprint's own outline to replace them.
 */
export type ExamCode = 'REG' | 'TCP' | 'FAR' | 'AUD' | 'BAR' | 'CFA1' | 'USMLE1' | 'NCLEX' | 'PMP' | 'CISSP' | 'SERIES7';
export interface ExamInfo { code: ExamCode; name: string; short: string; /** What it is called on screen: "CPA REG", "Bar exam". */ label: string; group: 'cpa' | 'other'; areas: Array<{ area: string; topics: string[] }> }

const CPA_ONLY: Array<Omit<ExamInfo, 'label' | 'group'>> = [
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

/** Other professional exams. Same rule as above: starting outlines from general knowledge of how each exam is organised, not the official blueprints. */
const OTHER_ONLY: Array<Omit<ExamInfo, 'label' | 'group'> & { label: string }> = [
  { code: 'BAR', name: 'Bar exam (Multistate subjects, essays and performance test)', short: 'Bar', label: 'Bar exam', areas: [
    { area: 'Civil procedure and constitutional law', topics: ['Jurisdiction and venue', 'Pleadings and joinder', 'Discovery and pretrial motions', 'Trials, judgments and appeals', 'Federal and state powers', 'Separation of powers', 'Due process and equal protection', 'First Amendment', 'State action'] },
    { area: 'Contracts and sales', topics: ['Formation and consideration', 'Defenses to enforcement', 'Performance, breach and conditions', 'Remedies', 'Third-party rights', 'UCC Article 2 sales'] },
    { area: 'Criminal law, procedure and evidence', topics: ['Homicide and other crimes', 'Criminal defenses', 'Fourth Amendment searches and seizures', 'Fifth and Sixth Amendment rights', 'Relevance and character evidence', 'Hearsay and its exceptions', 'Witnesses and expert evidence', 'Privileges'] },
    { area: 'Real property and torts', topics: ['Estates and future interests', 'Landlord and tenant', 'Easements and covenants', 'Mortgages and recording', 'Co-ownership', 'Intentional torts', 'Negligence', 'Strict and products liability', 'Defamation and privacy'] },
    { area: 'Essay and performance test subjects', topics: ['Business associations', 'Trusts and estates', 'Family law', 'Conflict of laws', 'Secured transactions', 'Professional responsibility', 'Performance test: file and library', 'Organising an essay answer'] },
  ] },
  { code: 'CFA1', name: 'CFA Level I', short: 'CFA I', label: 'CFA Level I', areas: [
    { area: 'Ethics and quantitative tools', topics: ['Ethics and professional standards', 'Time value of money', 'Statistical concepts and market returns', 'Probability and hypothesis testing', 'Portfolio math basics'] },
    { area: 'Economics', topics: ['Microeconomics and demand', 'Macroeconomics and policy', 'International trade and exchange rates'] },
    { area: 'Financial statements and corporate issuers', topics: ['Income statements', 'Balance sheets', 'Cash flow statements', 'Inventories, long-lived assets and taxes', 'Financial analysis techniques', 'Capital structure and corporate governance'] },
    { area: 'Investments', topics: ['Equity securities and market structure', 'Fixed-income features and valuation', 'Derivatives', 'Alternative investments', 'Portfolio management and risk'] },
  ] },
  { code: 'USMLE1', name: 'USMLE Step 1', short: 'Step 1', label: 'USMLE Step 1', areas: [
    { area: 'Foundations', topics: ['Biochemistry and metabolism', 'Molecular biology and genetics', 'Immunology', 'Microbiology', 'Pharmacology principles', 'Pathology principles', 'Biostatistics and epidemiology', 'Ethics and behavioural science'] },
    { area: 'Organ systems', topics: ['Cardiovascular', 'Respiratory', 'Renal and urinary', 'Gastrointestinal', 'Endocrine', 'Reproductive', 'Musculoskeletal and skin', 'Nervous system and special senses', 'Blood and lymph', 'Multisystem processes and nutrition'] },
  ] },
  { code: 'NCLEX', name: 'NCLEX-RN', short: 'NCLEX', label: 'NCLEX-RN', areas: [
    { area: 'Safe and effective care environment', topics: ['Management of care', 'Delegation and prioritisation', 'Safety and infection control'] },
    { area: 'Health promotion and psychosocial care', topics: ['Health promotion and maintenance', 'Growth and development', 'Psychosocial integrity', 'Mental health nursing'] },
    { area: 'Physiological integrity', topics: ['Basic care and comfort', 'Pharmacological and parenteral therapies', 'Dosage calculation', 'Reduction of risk potential', 'Physiological adaptation', 'Next-generation case studies'] },
  ] },
  { code: 'PMP', name: 'Project Management Professional', short: 'PMP', label: 'PMP', areas: [
    { area: 'People', topics: ['Leading a team', 'Conflict and negotiation', 'Stakeholder engagement', 'Team performance and coaching'] },
    { area: 'Process', topics: ['Scope, schedule and cost', 'Risk and issue management', 'Quality and procurement', 'Agile and hybrid delivery', 'Change management', 'Closing a project'] },
    { area: 'Business environment', topics: ['Benefits and value delivery', 'Compliance and governance', 'Organisational change'] },
  ] },
  { code: 'CISSP', name: 'Certified Information Systems Security Professional', short: 'CISSP', label: 'CISSP', areas: [
    { area: 'Security and risk, assets and architecture', topics: ['Security and risk management', 'Asset security', 'Security architecture and engineering', 'Cryptography'] },
    { area: 'Networks, identity and operations', topics: ['Communication and network security', 'Identity and access management', 'Security assessment and testing', 'Security operations', 'Software development security'] },
  ] },
  { code: 'SERIES7', name: 'Series 7 General Securities Representative', short: 'Series 7', label: 'Series 7', areas: [
    { area: 'Customers and accounts', topics: ['Seeking business and communications', 'Evaluating customers and suitability', 'Opening and maintaining accounts', 'Margin and account types'] },
    { area: 'Products', topics: ['Equity securities', 'Corporate and municipal bonds', 'Options', 'Packaged products and annuities', 'Government and agency securities'] },
    { area: 'Trading and rules', topics: ['Order handling and settlement', 'Market structure', 'Regulation and prohibited practices', 'Taxation of investments'] },
  ] },
];

export const EXAMS: ExamInfo[] = [
  ...CPA_ONLY.map((e) => ({ ...e, label: `CPA ${e.code}`, group: 'cpa' as const })),
  ...OTHER_ONLY.map((e) => ({ ...e, group: 'other' as const })),
];
export const CPA_EXAMS = EXAMS.filter((e) => e.group === 'cpa');
export const OTHER_EXAMS = EXAMS.filter((e) => e.group === 'other');
export const examLabel = (code: ExamCode): string => EXAMS.find((e) => e.code === code)!.label;

export const examInfo = (code: ExamCode): ExamInfo => EXAMS.find((e) => e.code === code)!;
