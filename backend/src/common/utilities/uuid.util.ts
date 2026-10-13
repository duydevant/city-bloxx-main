import { validate } from 'uuid';

export class UUIDUtil {
  static isUUID = (value: string) => validate(value);
}
