<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Services\ChromaDBService;

class SeedChromaDB extends Command
{
    // Cú pháp lệnh bạn sẽ gõ trên terminal
    protected $signature = 'chroma:seed';

    protected $description = 'Nạp dữ liệu quy định của DN FOOTBALL vào ChromaDB';

    public function handle(ChromaDBService $chroma)
    {
        $this->info('Đang nạp dữ liệu vào ChromaDB, vui lòng đợi vài giây...');
        
        $ketQua = $chroma->napDuLieuQuyDinh();
        
        $this->info($ketQua);
    }
}