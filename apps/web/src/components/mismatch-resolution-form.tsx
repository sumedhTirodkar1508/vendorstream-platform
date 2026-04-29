import { Button } from "@/components/ui/button";

type MismatchResolutionFormProps = {
  mismatchId: string;
  mismatchStatus: "OPEN" | "RESOLVED" | "WAIVED";
  canManage: boolean;
  action: (formData: FormData) => void | Promise<void>;
  hiddenFields?: Record<string, string>;
};

function Textarea({
  name,
  placeholder,
  rows = 4,
}: {
  name: string;
  placeholder: string;
  rows?: number;
}) {
  return (
    <textarea
      name={name}
      rows={rows}
      placeholder={placeholder}
      className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
    />
  );
}

export function MismatchResolutionForm({
  mismatchId,
  mismatchStatus,
  canManage,
  action,
  hiddenFields,
}: MismatchResolutionFormProps) {
  const isClosed = mismatchStatus !== "OPEN";
  const arePrimaryActionsDisabled = !canManage || isClosed;
  const isCommentDisabled = !canManage;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="mismatchId" value={mismatchId} />
      {hiddenFields
        ? Object.entries(hiddenFields).map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))
        : null}

      <div className="space-y-2">
        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
          Resolution comment
        </div>
        <Textarea
          name="comment"
          placeholder="Add operational context, rationale, or follow-up notes."
        />
      </div>

      <div className="space-y-2">
        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
          Manual override payload
        </div>
        <Textarea
          name="payloadJson"
          rows={5}
          placeholder='Optional JSON for manual overrides, for example { "chosenValue": "LP", "reason": "Confirmed with source file" }.'
        />
      </div>

      {!canManage ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-4 text-sm leading-6 text-amber-100">
          Resolution actions are limited to authorized manager-level users in
          this workspace.
        </div>
      ) : null}

      {canManage && isClosed ? (
        <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-4 text-sm leading-6 text-slate-300">
          This mismatch is already closed. You can still record an internal
          comment for audit history.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          type="submit"
          name="resolutionAction"
          value="ACCEPT_LP"
          disabled={arePrimaryActionsDisabled}
          className="bg-white text-slate-950 hover:bg-slate-100 disabled:bg-white/20 disabled:text-slate-400"
        >
          Accept LP
        </Button>
        <Button
          type="submit"
          name="resolutionAction"
          value="ACCEPT_STORE"
          disabled={arePrimaryActionsDisabled}
          className="bg-white text-slate-950 hover:bg-slate-100 disabled:bg-white/20 disabled:text-slate-400"
        >
          Accept store
        </Button>
        <Button
          type="submit"
          name="resolutionAction"
          value="MANUAL_OVERRIDE"
          disabled={arePrimaryActionsDisabled}
          variant="outline"
          className="border-white/15 bg-white/5 text-white hover:bg-white/10 disabled:text-slate-500"
        >
          Manual override
        </Button>
        <Button
          type="submit"
          name="resolutionAction"
          value="WAIVE"
          disabled={arePrimaryActionsDisabled}
          variant="outline"
          className="border-white/15 bg-white/5 text-white hover:bg-white/10 disabled:text-slate-500"
        >
          Waive
        </Button>
        <Button
          type="submit"
          name="resolutionAction"
          value="COMMENT_ONLY"
          disabled={isCommentDisabled}
          variant="ghost"
          className="text-slate-300 hover:bg-white/6 hover:text-white disabled:text-slate-500"
        >
          Comment
        </Button>
      </div>
    </form>
  );
}
