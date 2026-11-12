import React, { useState } from 'react';
import { Alert } from 'react-native';
import { useRecordings } from '../atlasRecorder/store';
import { documentService } from '../services/documentService';
import { answerRun, approveRun, cancelRun, startAccountant, startBill, startMeeting, useWorkflowRuns } from './service';
import { InputView, JobList, RunView, type Kind } from './WorkflowViews';

/** Multi-step helpers: pick a job, give it text, answer its questions, approve the result. The logic lives in ./service. */
export const WorkflowsScreen: React.FC = () => {
  const runs = useWorkflowRuns((s) => s.runs);
  const [kind, setKind] = useState<Kind | null>(null);
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [days, setDays] = useState(3);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const run = runs.find((r) => r.id === openId) ?? null;
  const recordings = useRecordings((s) => s.recordings).filter((r) => r.status === 'done' && r.utterances?.length);

  const work = async (job: () => Promise<{ id: string } | void>) => {
    setBusy(true);
    try { const r = await job(); if (r) setOpenId(r.id); } catch (e) { Alert.alert('Could not do that', String((e as Error)?.message || e)); } finally { setBusy(false); }
  };
  const pickFile = () => work(async () => {
    const { pick, types, isErrorWithCode, errorCodes } = require('@react-native-documents/picker');
    try {
      const [file] = await pick({ type: [types.allFiles], mode: 'import', allowMultiSelection: false });
      if (file) setText(await documentService.textFromPicked(file.uri, file.name ?? 'file.txt', 60000));
    } catch (e: any) { if (!(isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED)) throw e; }
  });
  const start = () => work(() => {
    if (kind === 'accountant') return startAccountant(text);
    return kind === 'meeting' ? startMeeting(text, title) : startBill(text, days);
  });

  if (run) {
    return (
      <RunView run={run} busy={busy} answers={answers} setAnswers={setAnswers}
        onContinue={() => work(async () => { const r = await answerRun(run, answers); setAnswers({}); return r; })}
        onApprove={() => work(() => approveRun(run))}
        onCancel={() => { cancelRun(run); setOpenId(null); }}
        onBack={() => { setOpenId(null); setAnswers({}); }} />
    );
  }
  if (kind) {
    return <InputView kind={kind} text={text} setText={setText} title={title} setTitle={setTitle} days={days} setDays={setDays}
      recordings={recordings} busy={busy} onFile={pickFile} onStart={start} onBack={() => setKind(null)} />;
  }
  return <JobList runs={runs} onPick={setKind} onOpen={setOpenId} />;
};
