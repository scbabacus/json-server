import moment from 'moment';
import { v4 } from 'uuid';

export function getData()
{

}

function ten_minutes_ahead() {
  return moment().add(10, 'minutes');
}

function gen_token() {
  return v4().replace(/\-/g, '');
}