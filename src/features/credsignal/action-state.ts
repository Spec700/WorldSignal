export interface CredSignalActionState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
  createdId?: string;
  protecteeId?: string;
}

export const initialCredSignalActionState: CredSignalActionState = {
  status: "idle",
};
