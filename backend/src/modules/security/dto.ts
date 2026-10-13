import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class EmailDto {
  @ApiProperty() @IsEmail() @MaxLength(255) email: string;
}
export class RegisterDto extends EmailDto {
  @ApiProperty({ minLength: 12, maxLength: 128 })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) fullName?: string;
}
export class LoginDto extends EmailDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(128) password: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) deviceName?: string;
}
export class TokenDto {
  @ApiProperty() @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) token: string;
}
export class ResetDto extends TokenDto {
  @ApiProperty() @IsString() @MinLength(12) @MaxLength(128) password: string;
}
export class PasswordDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(128) currentPassword: string;
  @ApiProperty() @IsString() @MinLength(12) @MaxLength(128) newPassword: string;
}
export class ProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) fullName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  avatarUrl?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_.-]{3,50}$/)
  username?: string;
}
export class AdminCreateUserDto extends EmailDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) fullName?: string;
}
export class AdminUpdateUserDto extends ProfileDto {}
export class UserStatusDto {
  @ApiProperty({ enum: ['active', 'suspended', 'pending'] })
  @IsIn(['active', 'suspended', 'pending'])
  status: string;
}
export class RoleIdsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  roleIds: string[];
}
export class PermissionIdsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  permissionIds: string[];
}
export class CreateRoleDto {
  @ApiProperty() @IsString() @Matches(/^[a-z][a-z0-9_]{1,99}$/) code: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(150) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
}
export class RoleUpdateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
}
export class ActiveDto {
  @ApiProperty() @IsBoolean() isActive: boolean;
}
export class CreatePermissionDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(150) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiProperty() @Matches(/^[a-z][a-z0-9_]{1,99}$/) resource: string;
  @ApiProperty() @Matches(/^[a-z][a-z0-9_]{1,49}$/) action: string;
}
export class PermissionUpdateDto extends PartialType(RoleUpdateDto) {}
export class ListDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  page = 1;
  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) search?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['active', 'pending', 'suspended', 'revoked', 'expired'])
  status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) role?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) resource?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') userId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') actorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') targetId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) action?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() to?: string;
  @ApiPropertyOptional({ enum: ['created_at', 'name', 'email'] })
  @IsOptional()
  @IsIn(['created_at', 'name', 'email'])
  sortBy = 'created_at';
  @ApiPropertyOptional({ enum: ['ASC', 'DESC'] })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  order: 'ASC' | 'DESC' = 'DESC';
}
