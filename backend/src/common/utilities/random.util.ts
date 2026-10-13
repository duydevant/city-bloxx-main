export enum CharCodeType {
  Number,
  All,
  Uppercase,
  Lowercase,
  NumberUppercase,
  NumberLowercase,
}

export class RandomUtil {
  static generateRandomNumber(length: number = 6): string {
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    return Math.floor(Math.random() * (max - min + 1)) + min + '';
  }

  static randomCode(
    length: number,
    type: CharCodeType = CharCodeType.Lowercase,
    prefix?: string,
  ): string {
    const chars = {
      [CharCodeType.Number]: '0123456789',
      [CharCodeType.All]: '0123456789abcdefghjklmnpqrstuvxyzABCDEFGHJKLMNPQRSTUVXYZ',
      [CharCodeType.Uppercase]: 'ABCDEFGHJKLMNPQRSTUVXYZ',
      [CharCodeType.Lowercase]: 'abcdefghjklmnpqrstuvxyz',
      [CharCodeType.NumberLowercase]: '0123456789abcdefghjklmnpqrstuvxyz',
      [CharCodeType.NumberUppercase]: '0123456789ABCDEFGHJKLMNPQRSTUVXYZ',
    }[type];

    const charsLength = chars.length;
    const keys = [];

    // For number type, ensure first digit is not 0
    if (type === CharCodeType.Number) {
      const firstDigitChars = '123456789';
      const firstDigit =
        firstDigitChars[Math.floor(Math.random() * firstDigitChars.length)];
      keys.push(firstDigit);
      for (let i = 1; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * charsLength);
        keys.push(chars[randomIndex]);
      }
    } else {
      for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * charsLength);
        keys.push(chars[randomIndex]);
      }
    }

    return prefix ? prefix + '_' + keys.join('') : keys.join('');
  }
}
