export class AppHelper {
  public static makeRandomString(
    length,
    characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
  ): string {
    let result = '';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }

    return result;
  }

  public static makeRandomNumber(min: number, max: number): number {
    return Math.floor(min + Math.random() * max);
  }

  public static insertString(
    str: string,
    start: number,
    delCount: number,
    newSubStr: string,
  ): string {
    return str.slice(0, start) + newSubStr + str.slice(start + Math.abs(delCount));
  }

  public static makeRandomPassword(): string {
    const password =
      this.makeRandomString(1, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') +
      this.makeRandomString(3, '!@#$%^&?') +
      this.makeRandomString(7);

    return password;
  }

  public static roundNumber(num: number, decimalCnt: number = 2) {
    if (!num) {
      return num;
    }
    const decimal = 10 ** decimalCnt;
    return Math.round((num + Number.EPSILON) * decimal) / decimal;
  }
}
