import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class StartRunDto {
  @ApiProperty({ enum: ['quick', 'daily'] }) @IsIn(['quick', 'daily']) mode:
    | 'quick'
    | 'daily';
  @ApiProperty({ format: 'uuid' }) @IsUUID('4') clientRequestId: string;
}
export class RunInputDto {
  @ApiProperty() @IsInt() @Min(0) @Max(431999) tick: number;
  @ApiProperty() @IsInt() @Min(0) @Max(4095) sequence: number;
  @ApiProperty() @IsInt() @Min(0) @Max(1000) fraction: number;
}
export class FinishRunDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID('4') runId: string;
  @ApiProperty() @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) ticket: string;
  @ApiProperty() @IsString() @Matches(/^[a-zA-Z0-9._-]{1,64}$/) physicsVersion: string;
  @ApiProperty() @IsString() @Matches(/^[a-zA-Z0-9._-]{1,64}$/) rulesetVersion: string;
  @ApiProperty() @IsInt() @Min(1) @Max(432000) endTick: number;
  @ApiProperty({ type: [RunInputDto], maxItems: 4096 })
  @IsArray()
  @ArrayMaxSize(4096)
  @ValidateNested({ each: true })
  @Type(() => RunInputDto)
  inputs: RunInputDto[];
}
