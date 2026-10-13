import bcrypt from 'bcryptjs';

export class HashUtil {
  static async hashData(data: string): Promise<string> {
    const salt = await bcrypt.genSalt();
    return await bcrypt.hash(data, salt);
  }

  static async verifyHashed(data: string, encrypted: string): Promise<boolean> {
    return bcrypt.compare(data, encrypted);
  }
}
