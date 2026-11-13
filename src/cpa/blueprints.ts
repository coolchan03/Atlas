/**
 * Starting outlines for the four exams, as topics to tick off. They are written from general knowledge of how the exams are
 * organised, NOT copied from the AICPA, and they will drift as the exams change. Compare them with the current AICPA blueprint
 * for your exam date and edit them: add, remove, rename, or paste the blueprint's own outline to replace them.
 */
export type ExamCode = 'REG' | 'TCP' | 'FAR' | 'AUD' | 'BAR' | 'CFA1' | 'CFA2' | 'CMA1' | 'CMA2' | 'EA' | 'SERIES7' | 'USMLE1' | 'NCLEX' | 'MCAT' | 'LSAT' | 'SAT' | 'ACT' | 'GRE' | 'GMAT' | 'PMP' | 'CISSP';
export type ExamField = 'Accounting, tax and finance' | 'Law and medicine' | 'College and graduate admissions' | 'Project and IT';
export interface ExamInfo { code: ExamCode; name: string; short: string; /** What it is called on screen: "CPA REG", "Bar exam". */ label: string; group: 'cpa' | 'other'; /** For the other exams: the section they are listed under. */ field?: ExamField; areas: Array<{ area: string; topics: string[] }> }

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
const OTHER_ONLY: Array<Omit<ExamInfo, 'label' | 'group'> & { label: string; field: ExamField }> = [
  { code: 'BAR', name: 'Bar exam (Multistate subjects, essays and performance test)', short: 'Bar', label: 'Bar exam', field: 'Law and medicine', areas: [
    { area: 'Civil procedure and constitutional law', topics: ['Jurisdiction and venue', 'Pleadings and joinder', 'Discovery and pretrial motions', 'Trials, judgments and appeals', 'Federal and state powers', 'Separation of powers', 'Due process and equal protection', 'First Amendment', 'State action'] },
    { area: 'Contracts and sales', topics: ['Formation and consideration', 'Defenses to enforcement', 'Performance, breach and conditions', 'Remedies', 'Third-party rights', 'UCC Article 2 sales'] },
    { area: 'Criminal law, procedure and evidence', topics: ['Homicide and other crimes', 'Criminal defenses', 'Fourth Amendment searches and seizures', 'Fifth and Sixth Amendment rights', 'Relevance and character evidence', 'Hearsay and its exceptions', 'Witnesses and expert evidence', 'Privileges'] },
    { area: 'Real property and torts', topics: ['Estates and future interests', 'Landlord and tenant', 'Easements and covenants', 'Mortgages and recording', 'Co-ownership', 'Intentional torts', 'Negligence', 'Strict and products liability', 'Defamation and privacy'] },
    { area: 'Essay and performance test subjects', topics: ['Business associations', 'Trusts and estates', 'Family law', 'Conflict of laws', 'Secured transactions', 'Professional responsibility', 'Performance test: file and library', 'Organising an essay answer'] },
  ] },
  { code: 'CFA1', name: 'CFA Level I', short: 'CFA I', label: 'CFA Level I', field: 'Accounting, tax and finance', areas: [
    { area: 'Ethics and quantitative tools', topics: ['Ethics and professional standards', 'Time value of money', 'Statistical concepts and market returns', 'Probability and hypothesis testing', 'Portfolio math basics'] },
    { area: 'Economics', topics: ['Microeconomics and demand', 'Macroeconomics and policy', 'International trade and exchange rates'] },
    { area: 'Financial statements and corporate issuers', topics: ['Income statements', 'Balance sheets', 'Cash flow statements', 'Inventories, long-lived assets and taxes', 'Financial analysis techniques', 'Capital structure and corporate governance'] },
    { area: 'Investments', topics: ['Equity securities and market structure', 'Fixed-income features and valuation', 'Derivatives', 'Alternative investments', 'Portfolio management and risk'] },
  ] },
  { code: 'CFA2', name: 'CFA Level II', short: 'CFA II', label: 'CFA Level II', field: 'Accounting, tax and finance', areas: [
    { area: 'Quantitative methods and economics', topics: ['Multiple regression and model misspecification', 'Time-series analysis', 'Machine learning basics', 'Currency exchange rates', 'Economic growth and country analysis'] },
    { area: 'Financial statements and corporate issuers', topics: ['Intercorporate investments', 'Employee compensation and pensions', 'Multinational operations', 'Financial reporting quality', 'Analysis of financial institutions', 'Capital budgeting and cost of capital', 'Mergers and acquisitions'] },
    { area: 'Investments and portfolios', topics: ['Equity valuation (dividend, free cash flow and residual income models)', 'Fixed income: term structure and credit analysis', 'Derivatives: forwards, futures, options and swaps', 'Alternative investments', 'Portfolio construction and risk management', 'Ethics and professional standards'] },
  ] },
  { code: 'CMA1', name: 'CMA Part 1: Financial Planning, Performance and Analytics', short: 'CMA 1', label: 'CMA Part 1', field: 'Accounting, tax and finance', areas: [
    { area: 'External financial reporting decisions', topics: ['Financial statements', 'Recognition, measurement and valuation', 'Income statement and balance sheet items', 'Statement of cash flows'] },
    { area: 'Planning, budgeting and forecasting', topics: ['Strategic planning', 'Budgeting concepts and methods', 'Forecasting techniques', 'Budget methodologies', 'Annual profit plan and supporting schedules'] },
    { area: 'Performance management and cost management', topics: ['Cost and variance measures', 'Responsibility centers and reporting', 'Performance measures and the balanced scorecard', 'Measurement concepts and cost behavior', 'Costing systems: job, process and activity-based', 'Overhead allocation', 'Supply chain and business process improvement'] },
    { area: 'Internal controls and technology', topics: ['Governance, risk and compliance', 'Systems controls and security', 'Data governance', 'Technology-enabled finance transformation', 'Data analytics'] },
  ] },
  { code: 'CMA2', name: 'CMA Part 2: Strategic Financial Management', short: 'CMA 2', label: 'CMA Part 2', field: 'Accounting, tax and finance', areas: [
    { area: 'Financial statement analysis', topics: ['Basic ratio analysis', 'Profitability analysis', 'Special issues in analysis'] },
    { area: 'Corporate finance', topics: ['Risk and return', 'Long-term financial management', 'Raising capital', 'Working capital management', 'Corporate restructuring', 'International finance'] },
    { area: 'Decision analysis and risk management', topics: ['Cost-volume-profit analysis', 'Marginal analysis', 'Pricing', 'Enterprise risk management'] },
    { area: 'Investment decisions and ethics', topics: ['Capital budgeting process', 'Discounted cash flow analysis', 'Payback and discounted payback', 'Risk analysis in capital budgeting', 'Ethical considerations for management accountants', 'Ethical considerations for the organization'] },
  ] },
  { code: 'EA', name: 'Enrolled Agent (IRS Special Enrollment Examination)', short: 'EA', label: 'Enrolled Agent', field: 'Accounting, tax and finance', areas: [
    { area: 'Part 1: Individuals', topics: ['Filing requirements and filing status', 'Income, gains and losses', 'Adjustments to income', 'Itemized and standard deductions', 'Credits', 'Retirement plans and Social Security', 'Basis and capital assets', 'Tax computation and payments'] },
    { area: 'Part 2: Businesses', topics: ['Business entities and their returns', 'Business income and expenses', 'Depreciation, amortization and depletion', 'Partnerships and S corporations', 'Corporations and distributions', 'Tax-exempt organizations', 'Employment taxes'] },
    { area: 'Part 3: Representation, practices and procedures', topics: ['Practice before the IRS and Circular 230', 'Taxpayer rights and the collection process', 'Examinations and appeals', 'Penalties', 'Powers of attorney and authorizations', 'Recordkeeping and e-file'] },
  ] },
  { code: 'MCAT', name: 'Medical College Admission Test', short: 'MCAT', label: 'MCAT', field: 'Law and medicine', areas: [
    { area: 'Biological and biochemical foundations of living systems', topics: ['Amino acids, proteins and enzymes', 'Metabolism and bioenergetics', 'Molecular biology and genetics', 'Cell biology and microbiology', 'Organ systems', 'Evolution and ecology basics'] },
    { area: 'Chemical and physical foundations of biological systems', topics: ['General chemistry: atoms, bonding and stoichiometry', 'Solutions, acids and bases', 'Thermodynamics and kinetics', 'Organic chemistry: structure and reactions', 'Mechanics, fluids and waves', 'Electricity, magnetism and circuits', 'Light and optics'] },
    { area: 'Psychological, social and biological foundations of behavior', topics: ['Sensation, perception and cognition', 'Learning, memory and emotion', 'Identity, attitudes and social behavior', 'Social structure, inequality and demographics', 'Research methods and statistics'] },
    { area: 'Critical analysis and reasoning skills', topics: ['Reading humanities passages', 'Reading social science passages', 'Reasoning within, beyond and about the text'] },
  ] },
  { code: 'LSAT', name: 'Law School Admission Test', short: 'LSAT', label: 'LSAT', field: 'Law and medicine', areas: [
    { area: 'Logical reasoning', topics: ['Identifying the conclusion and the argument structure', 'Assumptions: necessary and sufficient', 'Strengthen and weaken', 'Flaws in reasoning', 'Inference and must-be-true questions', 'Parallel reasoning', 'Principle questions', 'Conditional logic'] },
    { area: 'Reading comprehension', topics: ['Main point and primary purpose', 'Author attitude and tone', 'Passage structure and function of paragraphs', 'Comparative reading', 'Inference and application questions'] },
    { area: 'Writing sample and test strategy', topics: ['Writing the argument for a decision', 'Pacing and timing', 'Eliminating wrong answers'] },
  ] },
  { code: 'SAT', name: 'SAT (Reading and Writing, Math)', short: 'SAT', label: 'SAT', field: 'College and graduate admissions', areas: [
    { area: 'Reading and writing', topics: ['Words in context', 'Text structure and purpose', 'Central ideas and details', 'Command of evidence', 'Inferences', 'Boundaries: punctuation and sentence structure', 'Form, structure and sense: verbs, pronouns and agreement', 'Transitions and rhetorical synthesis'] },
    { area: 'Math', topics: ['Linear equations and inequalities', 'Systems of equations', 'Quadratics and nonlinear functions', 'Exponential growth and equivalent expressions', 'Ratios, rates and percentages', 'Statistics and probability', 'Geometry: area, volume, lines and angles', 'Right triangle trigonometry and circles'] },
  ] },
  { code: 'ACT', name: 'ACT (English, Math, Reading, Science)', short: 'ACT', label: 'ACT', field: 'College and graduate admissions', areas: [
    { area: 'English and Reading', topics: ['Conventions of standard English', 'Production of writing', 'Knowledge of language', 'Reading literary narrative and prose fiction', 'Reading social science and natural science passages', 'Key ideas and details, craft and structure'] },
    { area: 'Math and Science', topics: ['Pre-algebra and elementary algebra', 'Intermediate algebra and coordinate geometry', 'Plane geometry and trigonometry', 'Statistics and probability', 'Interpretation of data', 'Scientific investigation', 'Evaluation of models, inferences and experimental results'] },
  ] },
  { code: 'GRE', name: 'GRE General Test', short: 'GRE', label: 'GRE', field: 'College and graduate admissions', areas: [
    { area: 'Verbal reasoning', topics: ['Reading comprehension', 'Text completion', 'Sentence equivalence', 'Vocabulary in context', 'Critical reasoning in passages'] },
    { area: 'Quantitative reasoning', topics: ['Arithmetic and number properties', 'Algebra and equations', 'Geometry', 'Data analysis and statistics', 'Quantitative comparison', 'Word problems'] },
    { area: 'Analytical writing', topics: ['Analyze an issue', 'Analyze an argument', 'Planning and timing an essay'] },
  ] },
  { code: 'GMAT', name: 'GMAT Focus Edition', short: 'GMAT', label: 'GMAT', field: 'College and graduate admissions', areas: [
    { area: 'Quantitative reasoning', topics: ['Arithmetic and number properties', 'Algebra', 'Word problems', 'Percents, ratios and rates', 'Probability and counting'] },
    { area: 'Verbal reasoning', topics: ['Reading comprehension', 'Critical reasoning: assumptions and evaluation', 'Critical reasoning: strengthen and weaken', 'Inference and main idea'] },
    { area: 'Data insights', topics: ['Data sufficiency', 'Multi-source reasoning', 'Table analysis', 'Graphics interpretation', 'Two-part analysis'] },
  ] },
  { code: 'USMLE1', name: 'USMLE Step 1', short: 'Step 1', label: 'USMLE Step 1', field: 'Law and medicine', areas: [
    { area: 'Foundations', topics: ['Biochemistry and metabolism', 'Molecular biology and genetics', 'Immunology', 'Microbiology', 'Pharmacology principles', 'Pathology principles', 'Biostatistics and epidemiology', 'Ethics and behavioural science'] },
    { area: 'Organ systems', topics: ['Cardiovascular', 'Respiratory', 'Renal and urinary', 'Gastrointestinal', 'Endocrine', 'Reproductive', 'Musculoskeletal and skin', 'Nervous system and special senses', 'Blood and lymph', 'Multisystem processes and nutrition'] },
  ] },
  { code: 'NCLEX', name: 'NCLEX-RN', short: 'NCLEX', label: 'NCLEX-RN', field: 'Law and medicine', areas: [
    { area: 'Safe and effective care environment', topics: ['Management of care', 'Delegation and prioritisation', 'Safety and infection control'] },
    { area: 'Health promotion and psychosocial care', topics: ['Health promotion and maintenance', 'Growth and development', 'Psychosocial integrity', 'Mental health nursing'] },
    { area: 'Physiological integrity', topics: ['Basic care and comfort', 'Pharmacological and parenteral therapies', 'Dosage calculation', 'Reduction of risk potential', 'Physiological adaptation', 'Next-generation case studies'] },
  ] },
  { code: 'PMP', name: 'Project Management Professional', short: 'PMP', label: 'PMP', field: 'Project and IT', areas: [
    { area: 'People', topics: ['Leading a team', 'Conflict and negotiation', 'Stakeholder engagement', 'Team performance and coaching'] },
    { area: 'Process', topics: ['Scope, schedule and cost', 'Risk and issue management', 'Quality and procurement', 'Agile and hybrid delivery', 'Change management', 'Closing a project'] },
    { area: 'Business environment', topics: ['Benefits and value delivery', 'Compliance and governance', 'Organisational change'] },
  ] },
  { code: 'CISSP', name: 'Certified Information Systems Security Professional', short: 'CISSP', label: 'CISSP', field: 'Project and IT', areas: [
    { area: 'Security and risk, assets and architecture', topics: ['Security and risk management', 'Asset security', 'Security architecture and engineering', 'Cryptography'] },
    { area: 'Networks, identity and operations', topics: ['Communication and network security', 'Identity and access management', 'Security assessment and testing', 'Security operations', 'Software development security'] },
  ] },
  { code: 'SERIES7', name: 'Series 7 General Securities Representative', short: 'Series 7', label: 'Series 7', field: 'Accounting, tax and finance', areas: [
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
/** The sections the other exams are listed under, in the order shown. */
export const EXAM_FIELDS: ExamField[] = ['Accounting, tax and finance', 'Law and medicine', 'College and graduate admissions', 'Project and IT'];
export const examLabel = (code: ExamCode): string => EXAMS.find((e) => e.code === code)!.label;

export const examInfo = (code: ExamCode): ExamInfo => EXAMS.find((e) => e.code === code)!;
