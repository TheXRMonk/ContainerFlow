import { SmoothStepEdge, type EdgeProps } from "@xyflow/react";

export function OffsetEdge(props: EdgeProps) {
  const offset = (props.data as any)?.offset ?? 0;
  return <SmoothStepEdge {...props} pathOptions={{ offset, borderRadius: 8 }} />;
}
