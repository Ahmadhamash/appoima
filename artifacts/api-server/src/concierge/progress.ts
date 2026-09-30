export type GatheringProgress = {
 phase: 'searching' | 'reading' | 'collecting' | 'extracting' | 'saving' | 'complete';
 percent: number;
 url?: string;
 completed?: number;
 total?: number;
};
export type ProgressSink = (progress: GatheringProgress) => void;

/** Percentages describe completed stages of work; network wait time is not simulated. */
export function gatheringReporter(sink?: ProgressSink): ProgressSink {
 let percent = 0;
 return progress => {
  percent = Math.max(percent, Math.min(100, Math.max(0, Math.round(progress.percent))));
  try { sink?.({ ...progress, percent }); } catch { /* A disconnected observer must not interrupt saving the draft. */ }
 };
}
