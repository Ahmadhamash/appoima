import type { CompanyCandidate, Language } from './contract';

/** Finding an account link and reading its content are separate outcomes. */
export function publicSearchSummary(candidate: CompanyCandidate, language: Language): string {
 const scan = candidate.publicScan;
 if (!scan) return '';
 const count = (value: number | undefined) => Number.isFinite(value) ? Math.max(0, Math.floor(value!)) : 0;
 const linked = new Set((candidate.socialProfiles ?? []).map(url => url.replace(/\/$/, ''))).size;
 const read = count(scan.profilesRead), found = Math.max(linked, count(scan.profilesDiscovered), read);
 const ar = language === 'ar';
 const parts = [ar ? `وجدنا ${found} حسابات سوشال ميديا مرتبطة. قرأنا ${count(scan.pagesRead)} صفحة من المصادر المتاحة.` : `Found ${found} linked social media accounts. Read ${count(scan.pagesRead)} pages from available sources.`];
 if (read) parts.push(ar ? `قرأنا محتوى ${read} حسابات مباشرة.` : `Read content directly from ${read} accounts.`);
 if (found > read) parts.push(ar ? `تعذّر قراءة محتوى ${found - read} حسابات مباشرة، لكن روابطها متاحة أدناه.` : `Could not read content directly from ${found - read} accounts; their links are available below.`);
 parts.push(scan.postsRead ? (ar ? `قرأنا ${count(scan.postsRead)} منشورات عامة متاحة.` : `Read ${count(scan.postsRead)} available public posts.`) : (ar ? 'لم تتوفر منشورات عامة للقراءة.' : 'No public posts were available to read.'));
 if (scan.indexedSources) parts.push(ar ? `وجدنا أيضًا ${count(scan.indexedSources)} مصادر من نتائج البحث العامة.` : `Also found ${count(scan.indexedSources)} sources in public search results.`);
 if (scan.limited) parts.push(ar ? 'جمعنا ما أمكن ضمن وقت البحث.' : 'Collected within the search time limit.');
 return parts.join(' ');
}
