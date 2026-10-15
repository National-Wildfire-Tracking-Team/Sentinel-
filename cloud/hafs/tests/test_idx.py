import pytest

from fields import FIELDS
from idx import IdxError, parse_idx

# Lines in the shape of a real HAFS storm-nest inventory (hfsa, 2026100800, f003).
SAMPLE = '\n'.join([
    '1:0:d=2026100800:PRMSL:mean sea level:3 hour fcst:',
    '2:466336:d=2026100800:REFC:entire atmosphere (considered as a single layer):3 hour fcst:',
    '3:900000:d=2026100800:UGRD:10 m above ground:3 hour fcst:',
    '4:1300000:d=2026100800:VGRD:10 m above ground:3 hour fcst:',
    '5:1700000:d=2026100800:WIND:10 m above ground:2-3 hour max fcst:',
    '6:1800000:d=2026100800:PRATE:surface:0-3 hour ave fcst:',
    '7:1900000:d=2026100800:APCP:surface:0-3 hour acc fcst:',
    '8:2000000:d=2026100800:TMP:2 m above ground:3 hour fcst:',
]) + '\n'


def test_offsets_become_inclusive_byte_ranges():
    entries = parse_idx(SAMPLE, file_size=2100000)
    assert [(e.start, e.end) for e in entries[:2]] == [(0, 466335), (466336, 899999)]
    assert entries[-1].end == 2099999 and entries[-1].size == 100000


def test_last_entry_is_open_without_the_file_size():
    assert parse_idx(SAMPLE)[-1].end is None


def test_time_semantics():
    e = {x.var: x for x in parse_idx(SAMPLE)}
    assert (e['PRMSL'].kind, e['PRMSL'].period_start, e['PRMSL'].period_end) == ('fcst', 3, 3)
    assert (e['WIND'].kind, e['WIND'].period_start, e['WIND'].period_end) == ('max', 2, 3)
    assert (e['APCP'].kind, e['APCP'].period_end) == ('acc', 3)
    assert parse_idx('1:0:d=2026100800:PRMSL:mean sea level:anl:\n')[0].kind == 'anl'
    assert parse_idx('1:0:d=2026100800:APCP:surface:0-1 day acc fcst:\n')[0].period_end == 24


@pytest.mark.parametrize('text', ['', 'garbage\n', '1:abc:d=2026100800:X:y:anl:\n',
                                  '1:500:d=2026100800:A:b:anl:\n2:100:d=2026100800:C:d:anl:\n'])
def test_bad_inventories_raise(text):
    with pytest.raises(IdxError):
        parse_idx(text, file_size=1000)


def test_field_selection_follows_the_inventory():
    entries = parse_idx(SAMPLE, file_size=2100000)
    assert [e.var for e in FIELDS['windSpeed10m'].select(entries, 3)] == ['UGRD', 'VGRD']
    assert FIELDS['windMax10m'].select(entries, 3)[0].var == 'WIND'
    assert FIELDS['precipRate'].select(entries, 3)[0].var == 'PRATE'
    # At +3 h the 3-hour and total accumulations are the same message.
    assert FIELDS['precip3h'].select(entries, 3) == FIELDS['precipTotal'].select(entries, 3)
    # A different hour's message is never substituted.
    assert FIELDS['mslp'].select(entries, 6) is None
    assert FIELDS['gust'].select(entries, 3) is None


def test_hour_zero_uses_the_analysis_and_has_no_accumulation():
    entries = parse_idx('1:0:d=2026100800:PRMSL:mean sea level:anl:\n'
                        '2:10:d=2026100800:APCP:surface:0-0 hour acc fcst:\n', file_size=20)
    assert FIELDS['mslp'].select(entries, 0)[0].kind == 'anl'
    assert FIELDS['precipTotal'].select(entries, 0) is None
