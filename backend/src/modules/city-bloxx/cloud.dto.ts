import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const optional = (_: unknown, value: unknown) => value !== undefined;
export class GamePreferencesDto {
  @ApiPropertyOptional() @ValidateIf(optional) @IsBoolean() soundEnabled?: boolean;
  @ApiPropertyOptional() @ValidateIf(optional) @IsBoolean() musicEnabled?: boolean;
  @ApiPropertyOptional() @ValidateIf(optional) @IsBoolean() reducedMotion?: boolean;
}
export class GameProfileDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 24 })
  @ValidateIf(optional)
  @IsString()
  @Length(2, 24)
  @Matches(/^[^\p{Cc}<>]+$/u)
  alias?: string;
  @ApiPropertyOptional({ enum: ['en', 'vi'] })
  @ValidateIf(optional)
  @IsIn(['en', 'vi'])
  locale?: 'en' | 'vi';
  @ApiPropertyOptional({ type: GamePreferencesDto })
  @ValidateIf(optional)
  @IsObject()
  @ValidateNested()
  @Type(() => GamePreferencesDto)
  preferences?: GamePreferencesDto;
}
export class MutationDto {
  @ApiProperty({
    example: '0',
    description: 'Canonical PostgreSQL BIGINT decimal string; 0 means no cloud save',
  })
  @IsString()
  @Matches(/^(0|[1-9][0-9]{0,18})$/)
  expectedRevision: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID('4') mutationId: string;
}
export class SaveWriteDto extends MutationDto {
  @ApiProperty({ example: 4 }) @IsInt() @Min(1) @Max(2147483647) schema: number;
  @ApiProperty({ type: Object }) @IsObject() payload: Record<string, unknown>;
}
export class LocalSnapshotDto {
  @ApiProperty({ example: 4 }) @IsInt() @Min(1) @Max(2147483647) schema: number;
  @ApiProperty({
    description:
      'Original local JSON, at most 256 KiB UTF-8; future schemas preserved verbatim',
  })
  @IsString()
  @Length(2, 262144)
  rawPayload: string;
}
export class SaveResolveDto extends MutationDto {
  @ApiProperty({ enum: ['local', 'cloud'] }) @IsIn(['local', 'cloud']) choice:
    | 'local'
    | 'cloud';
  @ApiProperty({ type: LocalSnapshotDto })
  @IsObject()
  @ValidateNested()
  @Type(() => LocalSnapshotDto)
  local: LocalSnapshotDto;
  @ApiProperty({
    enum: [true],
    description:
      'Client has durably backed up both candidates before replacing its active snapshot',
  })
  @Equals(true)
  localBackupAcknowledged: boolean;
}
