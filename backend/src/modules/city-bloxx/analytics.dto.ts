import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsObject,
  IsString,
  IsUUID,
  Matches,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const optional = (_: unknown, value: unknown) => value !== undefined;

export const CLIENT_ANALYTICS_EVENT_TYPES = [
  'session_start',
  'mode_start',
  'run_finish',
  'retry',
  'city_accept',
  'daily_attempt',
  'daily_complete',
  'mission_claim',
  'cosmetic_unlock',
  'cosmetic_equip',
  'save_error',
  'load_timing',
] as const;

export type ClientAnalyticsEventType = (typeof CLIENT_ANALYTICS_EVENT_TYPES)[number];

export class AnalyticsEventItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  eventId!: string;

  @ApiProperty({ enum: CLIENT_ANALYTICS_EVENT_TYPES })
  @IsIn(CLIENT_ANALYTICS_EVENT_TYPES)
  type!: ClientAnalyticsEventType;

  @ApiProperty({ example: 'quick-tower-0.13.0' })
  @IsString()
  @Matches(/^[a-zA-Z0-9._-]{1,64}$/)
  version!: string;

  @ApiPropertyOptional({ enum: ['quick', 'city', 'daily'] })
  @ValidateIf(optional)
  @IsIn(['quick', 'city', 'daily'])
  mode?: 'quick' | 'city' | 'daily';

  @ApiPropertyOptional({
    enum: ['residential', 'industrial', 'office', 'highrise'],
  })
  @ValidateIf(optional)
  @IsIn(['residential', 'industrial', 'office', 'highrise'])
  classId?: 'residential' | 'industrial' | 'office' | 'highrise';

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @ValidateIf(optional)
  @IsObject()
  properties?: Record<string, unknown>;
}

export class AnalyticsBatchDto {
  @ApiProperty({ type: [AnalyticsEventItemDto], minItems: 1, maxItems: 20 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => AnalyticsEventItemDto)
  events!: AnalyticsEventItemDto[];
}

export class GuestAnalyticsBatchDto extends AnalyticsBatchDto {
  @ApiProperty({
    description: 'Anonymous client session identifier (hashed before storage)',
    example: 'guest_sess_0123456789abcdef',
  })
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{8,128}$/)
  anonymousSessionId!: string;
}
