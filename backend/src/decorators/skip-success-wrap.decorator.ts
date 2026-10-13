import { SetMetadata } from '@nestjs/common';
import { SKIP_SUCCESS_WRAP_KEY } from 'src/common/interceptors';

export const SkipSuccessWrap = () => SetMetadata(SKIP_SUCCESS_WRAP_KEY, true);
