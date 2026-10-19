import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const optional = (_: unknown, value: unknown) => value !== undefined;

export class ModerationRunsQueryDto {
  @ApiPropertyOptional({
    enum: ['quarantined', 'visible'],
    default: 'quarantined',
  })
  @ValidateIf(optional)
  @IsIn(['quarantined', 'visible'])
  moderationState: 'quarantined' | 'visible' = 'quarantined';

  @ApiPropertyOptional({
    enum: ['queued', 'processing', 'accepted', 'rejected'],
  })
  @ValidateIf(optional)
  @IsIn(['queued', 'processing', 'accepted', 'rejected'])
  state?: 'queued' | 'processing' | 'accepted' | 'rejected';

  @ApiPropertyOptional({
    enum: ['quick', 'daily'],
  })
  @ValidateIf(optional)
  @IsIn(['quick', 'daily'])
  mode?: 'quick' | 'daily';

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;

  @ApiPropertyOptional({ default: 0, minimum: 0, maximum: 10000 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  offset = 0;
}

export class ModerationActionDto {
  @ApiProperty({
    description: 'Mandatory audit reason for quarantining or releasing a run',
    minLength: 3,
    maxLength: 500,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  @Matches(/\S/)
  reason!: string;
}
