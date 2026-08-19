export interface PeopleActionState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
  createdId?: string;
  personId?: string;
}

export const initialPeopleActionState: PeopleActionState = {
  status: "idle",
};
