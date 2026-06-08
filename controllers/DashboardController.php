<?php
/**
 * Post-login dashboard: KPIs + charts (Chart.js) + recent addresses.
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Models\Statistics;
use App\SessionAuth;

final class DashboardController extends BaseController
{
    public function index(): void
    {
        $this->requireAuth();
        $this->render('dashboard/index.php', [
            'title'           => 'لوحة التحكم',
            'userName'        => SessionAuth::userName(),
            'userRole'        => SessionAuth::userRole(),
            'navCurrent'      => 'dashboard',
            'countUsers'      => Statistics::countUsers(),
            'countAddresses'  => Statistics::countAddresses(),
            'countStates'     => Statistics::countStates(),
            'countActiveShabiyat' => Statistics::countActiveShabiyat(),
            'byWilayah'       => Statistics::countByWilayah(),
            'topShabiyat'     => Statistics::topShabiyat(10),
            'byType'          => Statistics::countByType(),
            'last7Days'       => Statistics::last7DaysSeries(),
            'recent'          => Statistics::recentAddresses(5),
        ]);
    }
}
