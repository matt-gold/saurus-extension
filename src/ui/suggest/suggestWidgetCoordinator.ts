import * as vscode from "vscode";

/** Options for refresh suggest. */
/** Options for refresh suggest. */
export type RefreshSuggestOptions = {
    hard?: boolean;
    repeat?: number;
};

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** Triggers suggest widget. */
export async function triggerSuggestWidget(): Promise<void> {
  await vscode.commands.executeCommand("editor.action.triggerSuggest");
}

/** Implements hide suggest widget. */
export async function hideSuggestWidget(): Promise<void> {
  await vscode.commands.executeCommand("hideSuggestWidget");
}

/** Refreshes suggest widget. */
export async function refreshSuggestWidget(options: RefreshSuggestOptions = {}): Promise<void> {
  const hard = options.hard ?? false;
  const repeat = Math.max(1, options.repeat ?? 1);

  if (hard) {
    await hideSuggestWidget();
    await sleep(18);
  }

  for (let index = 0; index < repeat; index += 1) {
    await triggerSuggestWidget();
    if (index < repeat - 1) {
      await sleep(18);
    }
  }
}

// VS Code occasionally leaves a freshly refreshed suggest list in a state where
// accept closes the widget but the completion-item command does not run.
// A trailing delayed hard reopen mirrors the manual "click out and back in"
// recovery users observed, but keeps ordering/menu construction unchanged.
/** Refreshes suggest widget stable. */
export async function refreshSuggestWidgetStable(): Promise<void> {
  await refreshSuggestWidget({ hard: true, repeat: 1 });
  await sleep(45);
  await refreshSuggestWidget({ hard: true, repeat: 1 });
}
