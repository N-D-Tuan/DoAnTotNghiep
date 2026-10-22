<?php

namespace App\Traits;

use Illuminate\Support\Facades\DB;

trait GeneratesCustomId
{
    protected static function bootGeneratesCustomId()
    {
        static::creating(function ($model) {
            $primaryKey = $model->getKeyName();

            if (empty($model->{$primaryKey})) {
                $prefix = property_exists($model, 'idPrefix') ? $model->idPrefix : 'ID';
                $padLength = property_exists($model, 'idPadLength') ? $model->idPadLength : 3;

                $model->{$primaryKey} = self::generateNextCustomId(
                    $model->getTable(),
                    $primaryKey,
                    $prefix,
                    $padLength
                );
            }
        });
    }

    public static function generateNextCustomId(string $table, string $column, string $prefix, int $padLength = 3): string
    {
        $prefixLength = strlen($prefix);

        $maxNumber = DB::table($table)
            ->where($column, 'LIKE', $prefix . '%')
            ->lockForUpdate()
            ->selectRaw("MAX(CAST(SUBSTRING($column, " . ($prefixLength + 1) . ") AS UNSIGNED)) as max_num")
            ->value('max_num');

        $nextNumber = ($maxNumber ? (int)$maxNumber : 0) + 1;

        return $prefix . str_pad((string)$nextNumber, $padLength, '0', STR_PAD_LEFT);
    }

    public function getIncrementing()
    {
        return false;
    }

    public function getKeyType()
    {
        return 'string';
    }

    /**
     * Tự động ánh xạ song song Ma... và ID / ID_... khi trả JSON về cho Frontend JS
     */
    public function toArray()
    {
        $array = parent::toArray();
        $pk = $this->getKeyName();

        // 1. Ánh xạ Khóa chính (VD: MaDatSan -> ID = 'DS001')
        if ($pk && isset($array[$pk]) && !isset($array['ID'])) {
            $array['ID'] = $array[$pk];
        }

        // 2. Ánh xạ các Khóa ngoại (VD: MaCumSan -> ID_CumSan = 'CS001')
        foreach ($array as $key => $val) {
            if (str_starts_with($key, 'Ma') && $key !== $pk && $key !== 'MaOTP') {
                $legacyKey = 'ID_' . substr($key, 2);
                if (!array_key_exists($legacyKey, $array)) {
                    $array[$legacyKey] = $val;
                }
            }
        }

        // 3. Tương thích trạng thái hoạt động của CumSan
        if ($this->getTable() === 'CumSan' && isset($array['TrangThai'])) {
            $array['deleted_at'] = ($array['TrangThai'] === 'BaoTri') ? 'BaoTri' : null;
        }

        return $array;
    }
}