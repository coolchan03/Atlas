import { missingTerms } from '../../src/topics/gaps';

const passages = [
  'The lessee records a right-of-use asset and a lease liability. The lease liability is measured at present value. Depreciation of the asset follows.',
  'A lease liability reduces with each payment. The right-of-use asset is amortised. Present value uses the incremental borrowing rate. The borrowing rate matters.',
  'Short-term arrangements are exempt: a lease liability is not recorded. The incremental borrowing rate applies to the lessee.',
];

it('lists weighty words the sources repeat and the lesson never uses', () => {
  const lesson = 'A lease puts an asset and a liability on the books. The lessee records both.';
  const gaps = missingTerms(lesson, passages);
  expect(gaps).toEqual(['borrowing']); // the only unused word that comes up three times
  expect(gaps).not.toContain('liability'); // the lesson uses it (as a stem match)
  expect(gaps).not.toContain('lessee');
  expect(missingTerms('', [])).toEqual([]);
});

it('says nothing when the lesson covers what the sources stress', () => {
  const lesson = 'The lessee records a right-of-use asset and a lease liability at present value using the incremental borrowing rate, with amortised asset and depreciation. Short-term arrangements are exempt.';
  expect(missingTerms(lesson, passages)).toEqual([]);
});

it('treats a word and its plural as the same word', () => {
  const sources = ['The processes run. Processes start. Many processes end. A process is a run.'];
  expect(missingTerms('Each process is one run of the steps.', sources)).toEqual([]);
  expect(missingTerms('The steps are simple.', sources)).toEqual(['processes']);
});
