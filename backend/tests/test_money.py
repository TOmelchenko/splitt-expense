import pytest

from app.errors import ValidationError
from app.money import parse_amount_to_cents, split_equally


class TestSplitEqually:
    def test_splits_60_among_3_into_exactly_20_each(self):
        assert split_equally(6000, 3) == [2000, 2000, 2000]

    def test_gives_the_leftover_cent_to_the_first_participant_in_list_order(self):
        assert split_equally(1000, 3) == [334, 333, 333]

    def test_always_sums_back_to_the_original_total(self):
        for total in (1, 7, 999, 12345, 100000):
            for members in (1, 2, 3, 4, 7, 10):
                shares = split_equally(total, members)
                assert len(shares) == members
                assert sum(shares) == total

    def test_rejects_zero_members(self):
        with pytest.raises(ValidationError):
            split_equally(1000, 0)


class TestParseAmountToCents:
    def test_accepts_plain_and_2_decimal_amounts(self):
        assert parse_amount_to_cents("25.50") == 2550
        assert parse_amount_to_cents("25") == 2500
        assert parse_amount_to_cents(" 25,5 ") == 2550

    @pytest.mark.parametrize("bad", ["0", "0.00", "-5", "25.505", "abc", ""])
    def test_rejects_zero_negatives_and_more_than_2_decimals(self, bad):
        with pytest.raises(ValidationError):
            parse_amount_to_cents(bad)
