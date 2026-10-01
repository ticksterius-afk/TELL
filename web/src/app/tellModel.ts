import tellJson from "../../../model/tell.json";
import { validateTellParams, type TellParams } from "../engine/tell.ts";

/** TellScorer parameters (model/tell.json), validated once at load. */
export const TELL_PARAMS: TellParams = validateTellParams(tellJson);
