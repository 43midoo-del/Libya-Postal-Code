
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `shabiya_city_places` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `shabiya_name`   VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `shabiya_code`   VARCHAR(8) DEFAULT NULL,
  `place_name`     VARCHAR(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `lat`            DECIMAL(10,7) NOT NULL,
  `lng`            DECIMAL(10,7) NOT NULL,
  `place_kind`     VARCHAR(16) NOT NULL DEFAULT 'town',
  `sort_order`     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_sh_place` (`shabiya_name`(32), `place_name`(64)),
  KEY `idx_sh_name` (`shabiya_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='مدن محلية مرتبطة بالشعبية — تحميل سريع دون أداة خارجية';

DELETE FROM `shabiya_city_places`;
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('البطنان','B1','البطنان',24.550000,25.050000,'city',10);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('البطنان','B1','طبرق',32.086000,23.944000,'city',20);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('البطنان','B1','أمساعد',31.943200,25.061900,'town',30);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('درنة','B2','درنة',32.760000,22.640000,'city',40);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('درنة','B2','قرنوبة',32.718000,22.698000,'town',50);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('درنة','B2','البردي',32.069000,22.069000,'village',60);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('الجبل الأخضر','B3','الجبل الأخضر',32.170000,21.850000,'city',70);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('الجبل الأخضر','B3','المرج الغربي',31.986000,20.069000,'town',80);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('الجبل الأخضر','B3','سلوق',32.115000,20.069000,'town',90);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('المرج','B4','المرج',32.490000,20.830000,'city',100);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('المرج','B4','العقيلة',32.459000,20.069000,'town',110);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('المرج','B4','لمياء',31.069000,20.069000,'town',120);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('بنغازي','B5','بنغازي',32.120000,20.070000,'city',130);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('بنغازي','B5','سلماني',32.105000,20.069000,'suburb',140);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('بنغازي','B5','قمينيس',32.069000,20.119000,'suburb',150);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('الواحات','B6','الواحات',29.180000,16.550000,'city',160);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('الواحات','B6','أجدابيا',30.259000,19.219000,'city',170);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('الكفرة','B7','الكفرة',24.200000,23.320000,'city',180);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('الكفرة','B7','تاجري',25.069000,24.069000,'town',190);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('سرت','T8','سرت',31.200000,16.580000,'city',200);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('سرت','T8','بو سدرة',30.069000,18.069000,'village',210);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('سرت','T8','هراوة',31.019000,16.069000,'village',220);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('النقاط الخمس','T9','النقاط الخمس',31.550000,14.850000,'city',230);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('النقاط الخمس','T9','بئر الغنم',31.569000,14.069000,'town',240);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('مصراتة','T10','مصراتة',32.380000,15.100000,'city',250);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('مصراتة','T10','زليتن',32.467000,14.569000,'city',260);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('مصراتة','T10','الخمس',31.962000,14.289000,'town',270);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('المرقب','T11','المرقب',32.650000,14.260000,'city',280);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('المرقب','T11','الخمس',32.648000,14.269000,'city',290);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('المرقب','T11','تاجوراء',32.434000,13.627000,'city',300);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('طرابلس','T12','طرابلس',32.890000,13.190000,'city',310);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('طرابلس','T12','أبو سليم',32.819000,13.169000,'suburb',320);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('طرابلس','T12','جنزور',32.819000,12.694000,'town',330);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('طرابلس','T12','قرقارش',32.834000,13.069000,'suburb',340);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('الجفارة','T13','الجفارة',32.700000,12.980000,'city',350);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('الجفارة','T13','عين زارة',32.769000,13.069000,'town',360);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('الزاوية','T14','الزاوية',32.750000,12.730000,'city',370);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('الزاوية','T14','صرمان',32.431000,12.869000,'town',380);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('الزاوية','T14','رقدالين',32.391000,12.379000,'town',390);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('الجبل الغربي','T15','الجبل الغربي',32.100000,13.020000,'city',400);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('الجبل الغربي','T15','غاريان',32.169000,13.019000,'city',410);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('الجبل الغربي','T15','يفرن',32.069000,12.569000,'town',420);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('نالوت','T16','نالوت',31.870000,10.980000,'city',430);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('نالوت','T16','غدامس',30.069000,11.069000,'city',440);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('الجفرة','F17','الجفرة',29.530000,16.140000,'city',450);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('الجفرة','F17','هون',29.069000,15.069000,'city',460);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('وادي الشاطئ','F18','وادي الشاطئ',29.550000,14.280000,'city',470);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('وادي الشاطئ','F18','أوباري',26.069000,10.069000,'city',480);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('وادي الشاطئ','F18','إدري',27.069000,12.069000,'town',490);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('سبها','F19','سبها',27.040000,14.430000,'city',500);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('سبها','F19','تمندة',27.069000,14.069000,'town',510);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('وادي الحياة','F20','وادي الحياة',26.580000,12.730000,'city',520);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('وادي الحياة','F20','التُرك',25.069000,10.069000,'town',530);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('غات','F21','غات',24.960000,10.180000,'city',540);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('غات','F21','الديّة',25.069000,10.069000,'town',550);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('مرزق','F22','مرزق',25.910000,13.920000,'city',560);
INSERT INTO `shabiya_city_places` (`shabiya_name`,`shabiya_code`,`place_name`,`lat`,`lng`,`place_kind`,`sort_order`) VALUES ('مرزق','F22','التُوي',25.069000,15.069000,'village',570);
