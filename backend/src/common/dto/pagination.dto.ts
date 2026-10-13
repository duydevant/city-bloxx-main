import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { APP_DEFAULTS } from 'src/common/constants';

export class PaginationQueryDto {
  @ApiPropertyOptional({ type: Number, example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = APP_DEFAULTS.PAGINATION.PAGE_DEFAULT;

  @ApiPropertyOptional({ type: Number, example: 10, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = APP_DEFAULTS.PAGINATION.LIMIT_DEFAULT;
}

@Exclude()
export class PaginationMetadataResponseDto {
  @Expose()
  @ApiProperty()
  page: number;

  @Expose()
  @ApiProperty()
  pageSize: number;

  @Expose()
  @ApiProperty()
  totalPages: number;

  @Expose()
  @ApiProperty()
  total: number;
}

@Exclude()
export class PaginationResponseDto<T> {
  @Expose()
  @ApiProperty()
  data: T[];

  @Expose()
  @ApiProperty({ type: PaginationMetadataResponseDto })
  pagination: PaginationMetadataResponseDto;
}
