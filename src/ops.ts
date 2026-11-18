/**
 * Opcode numbers of the Mendoza patch format, for building and reading raw patches.
 */
export const Op = {
  Value: 0,
  Copy: 1,
  Blank: 2,
  ReturnIntoArray: 3,
  ReturnIntoObject: 4,
  ReturnIntoObjectSameKey: 5,
  PushField: 6,
  PushElement: 7,
  PushParent: 8,
  Pop: 9,
  PushFieldCopy: 10,
  PushFieldBlank: 11,
  PushElementCopy: 12,
  PushElementBlank: 13,
  ReturnIntoObjectPop: 14,
  ReturnIntoObjectSameKeyPop: 15,
  ReturnIntoArrayPop: 16,
  ObjectSetFieldValue: 17,
  ObjectCopyField: 18,
  ObjectDeleteField: 19,
  ArrayAppendValue: 20,
  ArrayAppendSlice: 21,
  StringAppendString: 22,
  StringAppendSlice: 23,
} as const
