export interface WorkflowTransition<TState extends string> {
  readonly from: TState;
  readonly to: TState;
}

export interface WorkflowDefinition<TState extends string> {
  readonly states: readonly TState[];
  readonly transitions: readonly WorkflowTransition<TState>[];
}

export function canTransition<TState extends string>(
  workflow: WorkflowDefinition<TState>,
  from: TState,
  to: TState,
): boolean {
  return workflow.transitions.some((transition) => transition.from === from && transition.to === to);
}

export function assertTransition<TState extends string>(
  workflow: WorkflowDefinition<TState>,
  from: TState,
  to: TState,
): void {
  if (!canTransition(workflow, from, to)) {
    throw new Error(`Invalid workflow transition: ${from} -> ${to}`);
  }
}
